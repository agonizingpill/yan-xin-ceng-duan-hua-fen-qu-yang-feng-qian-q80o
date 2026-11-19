import json
import numpy as np
from sqlalchemy import select
from src.database import Session,Base,engine
from src.models import User,Borehole,CoreRun,Reading,MissingInterval,Interpretation,Stratum,SampleInterval,Seal,Custody,ColumnRevision
from src.security import password_hash
AREA='青石沟东线工区'
def add_hole(s,code,site,depth,quota,rng,anomaly=False,noise=1.0):
    h=Borehole(code=code,area=AREA,site=site,total_depth=depth,cut_quota=quota);s.add(h);s.flush()
    for code0,start,end,recovered in [('R01',0,18,17),('R02',18,depth,depth-18)]:
        run=CoreRun(borehole_id=h.id,code=code0,start_m=start,end_m=end,recovered_m=recovered);s.add(run);s.flush()
        for d in np.arange(start+.5,end,1):
            if d==12.5:continue
            group=min(int(d//12),2);center=[(2.1,12,2200),(2.6,50,4100),(3.1,100,6100)][group]
            dens,sus,vel=center[0]+rng.normal(0,.035*noise),center[1]+rng.normal(0,1.5*noise),center[2]+rng.normal(0,55*noise)
            # 30.5m 密度与声速超出 BH-31 标尺实测范围，标尺归类时应为待判点
            if anomaly and d==30.5:dens,vel=4.62,7800
            s.add(Reading(borehole_id=h.id,run_id=run.id,depth_m=float(d),density=round(float(dens),4),susceptibility=round(float(sus),4),velocity=round(float(vel),3)))
    s.add(MissingInterval(borehole_id=h.id,start_m=12,end_m=13,state='observed',reason=''))
    return h
def seed():
    Base.metadata.create_all(engine)
    with Session.begin()as s:
        for role in ['operator','supervisor','viewer']:
            if not s.scalar(select(User).where(User.email==role+'@liheng.local')):s.add(User(email=role+'@liheng.local',password=password_hash('Core2026!'),role=role))
        # 历史数据升级：旧孔补工区，缺拟合依据的 historical 解释保持只可查看
        for h0 in s.scalars(select(Borehole)).all():
            if not h0.area:h0.area=AREA
        h=s.scalar(select(Borehole).where(Borehole.code=='BH-31'))
        if not h:
            h=add_hole(s,'BH-31','砾衡青石沟东线 / ZK-31',36,6,np.random.default_rng(42))
            legacy=Interpretation(borehole_id=h.id,state='historical',mode='gmm',evidence={'note':'旧纸本区间来源，仅保留既有切样，不替代新GMM解释'});s.add(legacy);s.flush();st=Stratum(interpretation_id=legacy.id,start_m=0,end_m=12,lithology='旧编录砂岩',contact_note='纸本编录回录，仅保留历史取样依据');s.add(st);s.flush();sample=SampleInterval(borehole_id=h.id,stratum_id=st.id,code='CS-031-OLD',start_m=8,end_m=9,purpose='历史抗压试验',destructive=True,state='broken');s.add(sample);s.flush();s.add(Seal(sample_id=sample.id,code='CX031-001',state='broken',reason='运输交接发现铅封裂口，待现场核样重封',sealed_by='operator@liheng.local',snapshot={'code':sample.code,'start_m':8,'end_m':9,'source':'历史纸本'}))
        # 同工区新孔：主管发布 BH-31 标尺后，本孔直接沿用标尺物性尺度与层型归类；噪声收紧使待判点集中在植入异常
        if not s.scalar(select(Borehole).where(Borehole.code=='BH-32')):
            add_hole(s,'BH-32','砾衡青石沟东线 / ZK-32',36,6,np.random.default_rng(7),anomaly=True,noise=.3)
    with Session()as s:return {cls.__tablename__:len(s.scalars(select(cls)).all())for cls in [User,Borehole,CoreRun,Reading,MissingInterval,Interpretation,Stratum,SampleInterval,Seal,Custody,ColumnRevision]}
if __name__=='__main__':print(json.dumps(seed(),ensure_ascii=False))
