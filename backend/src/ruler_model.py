FEATURES=['density','susceptibility','velocity']
def classify(rows,ruler):
    """按标尺把本孔实测点归入层型；三项物性任一超出标尺实测范围的点标待判，不参与自动归类。"""
    ranges=ruler['ranges'];types=ruler['layer_types']
    classified=[];pending=[]
    for r in rows:
        out=[f for f in FEATURES if r[f]<ranges[f]['min']-1e-9 or r[f]>ranges[f]['max']+1e-9]
        if out:
            pending.append({'reading_id':r['id'],'depth_m':r['depth_m'],'density':r['density'],'susceptibility':r['susceptibility'],'velocity':r['velocity'],'reasons':[f+'超出标尺实测范围'for f in out]})
            continue
        # 各物性按标尺范围归一化后到层型中心的欧氏距离，避免量纲主导归类
        best=None;best_d=None
        for t in types:
            d=sum(((r[f]-t['center'][f])/max(ranges[f]['max']-ranges[f]['min'],1e-9))**2 for f in FEATURES)**.5
            if best_d is None or d<best_d:best,best_d=t,d
        span=max(ranges['density']['max']-ranges['density']['min'],1e-9)
        margin=1-best_d
        classified.append({'reading_id':r['id'],'depth_m':r['depth_m'],'layer_type':best['layer_type'],'lithology':best['lithology'],'posterior':round(max(margin,0),6),'density':r['density'],'susceptibility':r['susceptibility'],'velocity':r['velocity']})
    contacts=[round((a['depth_m']+b['depth_m'])/2,4)for a,b in zip(classified,classified[1:])if a['layer_type']!=b['layer_type']]
    return {'algorithm':'ruler nearest-center classification','ruler_id':ruler['id'],'ruler_version':ruler['version'],'area':ruler['area'],'features':FEATURES,'ranges':ranges,'layer_types':types,'source_count':len(rows),'classified_count':len(classified),'pending_count':len(pending),'classified':classified,'pending':pending,'suggested_contacts_m':contacts,'note':'层型编号与岩性沿用已发布标尺；待判点物性超出标尺实测范围，须人工研判，不能自动归层'}
