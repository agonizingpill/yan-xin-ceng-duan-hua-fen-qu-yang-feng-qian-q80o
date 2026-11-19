from sqlalchemy import select
from fastapi import HTTPException
from .models import Ruler,Interpretation,Stratum,Borehole,Reading
from .common import get,pack,audit
from .ruler_model import FEATURES
def _fitted_basis(ev):
    # 缺拟合依据的旧解释（纸本 historical、failed 等）不能拿来当标尺
    return isinstance(ev,dict)and ev.get('algorithm')and ev.get('source_sha256')and ev.get('chosen_k')and ev.get('cluster_centers')
def publish(s,p,u):
    if u['role']!='supervisor':raise HTTPException(403,'当前角色没有此操作权限')
    x=get(s,Interpretation,p.interpretation_id,True)
    if x.state!='confirmed':raise HTTPException(409,'仅主管已确认且带拟合依据的解释可发布为标尺')
    if x.mode!='gmm':raise HTTPException(409,'标尺归类解释沿用既有标尺，不能再作为标尺来源')
    if not _fitted_basis(x.evidence):raise HTTPException(409,'缺拟合依据的旧解释不能拿来当标尺')
    h=get(s,Borehole,x.borehole_id)
    area=h.area
    if not area:raise HTTPException(409,'钻孔未登记工区，不能发布工区标尺')
    if s.scalar(select(Ruler.id).where(Ruler.area==area,Ruler.version==p.version)):raise HTTPException(409,'同工区标尺版本号已存在，切换未执行，旧版保留')
    strata=s.scalars(select(Stratum).where(Stratum.interpretation_id==x.id).order_by(Stratum.start_m)).all()
    if not strata:raise HTTPException(409,'解释缺少人工层段，标尺切换未执行，旧版保留')
    rows=s.scalars(select(Reading).where(Reading.borehole_id==h.id)).all()
    if not rows:raise HTTPException(409,'来源孔没有实测物性，标尺切换未执行，旧版保留')
    # 层型编号取自人工层段顺序，物性中心取拟合成分中心并按密度顺序对齐
    centers=sorted(x.evidence['cluster_centers'],key=lambda c:c['density'])
    if len(centers)!=len(strata):raise HTTPException(409,'人工层数与拟合成分数不一致，标尺切换未执行，旧版保留')
    layer_types=[]
    for i,(st,c)in enumerate(zip(strata,centers),1):
        layer_types.append({'layer_type':'T%02d'%i,'lithology':st.lithology,'start_m':st.start_m,'end_m':st.end_m,'contact_note':st.contact_note,'center':{f:float(c[f])for f in FEATURES}})
    ranges={f:{'min':round(min(r.__dict__[f]for r in rows),6),'max':round(max(r.__dict__[f]for r in rows),6)}for f in FEATURES}
    # 旧 active 整版保留为 superseded；任何校验失败都在提交前抛出，旧版不受影响
    old=s.scalars(select(Ruler).where(Ruler.area==area,Ruler.state=='active')).all()
    ruler=Ruler(area=area,version=p.version,state='active',source_interpretation_id=x.id,source_borehole_code=h.code,basis={'algorithm':x.evidence['algorithm'],'source_sha256':x.evidence['source_sha256'],'chosen_k':x.evidence['chosen_k'],'bic_candidates':x.evidence['bic_candidates'],'holdout_stability_ari':x.evidence['holdout_stability_ari'],'holdout_mean_log_likelihood':x.evidence['holdout_mean_log_likelihood'],'train_count':x.evidence['train_count'],'holdout_count':x.evidence['holdout_count']},ranges=ranges,layer_types=layer_types,published_by=u['email'])
    s.add(ruler);s.flush()
    for o in old:o.state='superseded'
    audit(s,u,'发布工区标尺 %s v%s（来源 %s），旧版 %d 份保留'%(area,p.version,h.code,len(old)))
    return pack(ruler)
def active_for(s,area):
    if not area:return None
    return s.scalar(select(Ruler).where(Ruler.area==area,Ruler.state=='active').order_by(Ruler.id.desc()))
