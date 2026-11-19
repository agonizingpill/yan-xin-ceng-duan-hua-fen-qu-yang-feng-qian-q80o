import{heading,badge,depthBand}from'../components/logbook.js';import{esc,values}from'../utils/format.js';import{api}from'../utils/api.js';import{MODES}from'../constants.js';
const FEATURES=[['density','密度 g/cm³'],['susceptibility','磁化率 ×10⁻⁵'],['velocity','声速 m/s']];
const activeRuler=(s,h)=>h?s.data.rulers.filter(r=>r.area===h.area&&r.state==='active').at(-1):null;
const rulerById=(s,id)=>s.data.rulers.find(r=>r.id===id);
function prefillRuler(ev,h){
    // 按标尺归类结果生成连续层段草稿：相邻层型变化处分界，待判深度由相邻已判点夹合
    let pts=ev.classified,edges=[0];
    for(let i=1;i<pts.length;i++)if(pts[i].layer_type!==pts[i-1].layer_type)edges.push(+((pts[i-1].depth_m+pts[i].depth_m)/2).toFixed(2));
    edges.push(h.total_depth);
    let by=Object.fromEntries(ev.layer_types.map(t=>[t.layer_type,t]));
    return edges.slice(0,-1).map((st,i)=>{let en=edges[i+1],t=by[pts.find(p=>p.depth_m>=st&&p.depth_m<en)?.layer_type]||ev.layer_types[0];return[st,en,t.layer_type,t.lithology,'标尺最近中心归类，结合岩芯纹理人工校核'].join(',')}).join('\n');
}
function rulerPanel(s,h,x,ev,u){
    let r=rulerById(s,x.ruler_id),total=h.total_depth||36;
    return `<div class="ruler-banner"><div><small>本解释所用标尺（受理时钉版，整孔不换版）</small><b>${esc(r.area)} · ${esc(r.version)}</b> ${badge(r.state)}</div><p class="tiny">来源孔 ${esc(r.source_borehole_code)} · ${esc(r.basis.algorithm)} · 源数据SHA256 ${esc(String(r.basis.source_sha256).slice(0,16))}… · k=${r.basis.chosen_k} · ARI ${r.basis.holdout_stability_ari}</p></div>
    <div class="model-caption"><h2>标尺层型 <b>${ev.layer_types.length}</b></h2><p>已归类 ${ev.classified_count} 点 / 待判 <b class="error">${ev.pending_count}</b> 点<br>三项物性任一超出标尺实测范围即标待判，不参与自动归层</p></div>
    <div class="cluster-track">${ev.classified.map(p=>`<span class="cluster c${+p.layer_type.slice(1)}" style="left:${p.depth_m/total*100}%" title="${p.depth_m}m · ${p.layer_type} ${esc(p.lithology)}">${esc(p.layer_type)}</span>`).join('')}${ev.pending.map(p=>`<span class="pending-dot" style="left:${p.depth_m/total*100}%" title="${p.depth_m}m 待判：${esc(p.reasons.join('；'))}">判</span>`).join('')}</div>
    ${ev.pending.length?`<h2>待判点（须人工研判，不能自动归层）</h2><div class="point-scroll"><table><thead><tr><th>深度 m</th><th>密度</th><th>磁化率</th><th>声速</th><th>待判原因</th></tr></thead><tbody>${ev.pending.map(p=>`<tr class="pending-row"><td>${p.depth_m.toFixed(2)}</td><td>${p.density}</td><td>${p.susceptibility}</td><td>${p.velocity}</td><td>${esc(p.reasons.join('；'))}</td></tr>`).join('')}</tbody></table></div>`:''}
    <h2>标尺实测物性范围</h2><table><thead><tr><th>物性</th><th>实测下限</th><th>实测上限</th></tr></thead><tbody>${FEATURES.map(([f,n])=>`<tr><td>${n}</td><td>${ev.ranges[f].min}</td><td>${ev.ranges[f].max}</td></tr>`).join('')}</tbody></table>
    <h2>层型归类（跨孔对照编号）</h2>${ev.layer_types.map(t=>`<div class="stratum-record"><b>${esc(t.layer_type)} · ${esc(t.lithology)}</b>${depthBand(t.start_m,t.end_m,h.total_depth)}<small>来源孔层位 ${t.start_m}—${t.end_m}m · 中心物性 密度${t.center.density} / 磁化率${t.center.susceptibility} / 声速${t.center.velocity}</small></div>`).join('')}
    <details><summary>标尺拟合依据</summary><pre>${esc(JSON.stringify(r.basis,null,2))}</pre></details><p class="tiny">${esc(ev.note)}。候选接触深度 ${ev.suggested_contacts_m.join(' / ')||'无'} m。</p>`;
}
function gmmPanel(s,h,x,ev){
    return `<div class="strata-layout-internal"><section><div class="model-caption"><h2>候选成分 <b>${ev.chosen_k}</b></h2><p>训练 ${ev.train_count} / 留出 ${ev.holdout_count} · ARI ${ev.holdout_stability_ari}<br>留出平均对数似然 ${ev.holdout_mean_log_likelihood}</p></div><div class="cluster-track">${ev.classified.map(r=>`<span class="cluster c${r.cluster}" style="left:${r.depth_m/(h.total_depth||36)*100}%" title="${r.depth_m}m · 成分${r.cluster} · 后验${r.posterior}">${r.cluster}</span>`).join('')}</div><p class="tiny">${esc(ev.note)}。候选接触深度 ${ev.suggested_contacts_m.join(' / ')} m。</p><table><thead><tr><th>成分数</th><th>训练BIC / 越低越好</th></tr></thead><tbody>${ev.bic_candidates.map(b=>`<tr class="${b.k===ev.chosen_k?'chosen':''}"><td>${b.k}</td><td>${b.bic}</td></tr>`).join('')}</tbody></table></section></div>`;
}
export function render(s,u){
    let h=s.hole,all=s.list('interpretations'),x=all.filter(x=>x.state!=='historical'&&x.state!=='withdrawn').at(-1),ev=x?.evidence,ruler=activeRuler(s,h),used=x?.ruler_id?rulerById(s,x.ruler_id):null;
    let rows=x?s.data.strata.filter(y=>y.interpretation_id===x.id):[];
    let gmmDefault='0,12,粉砂岩,依据颜色粒径和回次接触面记录人工判读\n12,24,泥质砂岩,缺芯两侧物性与岩性变化共同判定层面\n24,36,致密灰岩,声速密度跃升并结合岩芯表面纹理确认';
    let text=rows.length?rows.map(r=>x.mode==='ruler'?[r.start_m,r.end_m,r.layer_type,r.lithology,r.contact_note].join(','):[r.start_m,r.end_m,r.lithology,r.contact_note].join(',')).join('\n'):(x?.mode==='ruler'&&ev?.layer_types?prefillRuler(ev,h):gmmDefault);
    let areaRulers=h?s.data.rulers.filter(r=>r.area===h.area):[],confirmed=s.list('interpretations').find(i=>i.state==='confirmed');
    return heading('03','让相似物性，回到地层解释。','主管可把带拟合依据的确认解释发布为工区标尺；新孔沿用标尺物性尺度与层型编号，超范围点标待判。标尺受理即钉版，切换失败保留旧版。')
    +`<section class="ruler-desk"><h2>工区标尺 <small>${esc(h?.area||'未登记工区')}</small></h2>${areaRulers.length?areaRulers.map(r=>`<div class="ruler-row"><b>${esc(r.version)}</b> ${badge(r.state)}<small>来源 ${esc(r.source_borehole_code)} · ${r.layer_types.length} 个层型 · ${esc(r.published_by)}</small></div>`).join(''):'<p class="note">本工区尚无标尺。主管在本孔完成 GMM 拟合、人工编录并确认后，可在下方发布。</p>'}
    ${u.role==='supervisor'&&confirmed&&h?.state==='open'?`<form id="ruler-publish" class="ruler-publish"><div class="pair"><label>标尺版本号<input name="version" value="R01-20261118" required></label><input type="hidden" name="interpretation_id" value="${confirmed.id}"></div><button class="ochre">把本孔确认解释发布为工区标尺</button><p class="note">仅带 GMM 拟合依据的确认解释可发布；缺拟合依据的旧纸本解释会被拒绝。版本号冲突或校验失败时切换不执行，现行旧版整版保留。</p></form>`:''}</section>`
    +`<div class="strata-tools"><button id="interpret" ${u.role==='viewer'||h?.state!=='open'?'disabled':''}>${ruler?'按工区标尺 '+esc(ruler.version)+' 归类本孔物性':'按本孔物性生成GMM层段候选'}</button>${x?badge(x.state):''}${x?`<span class="mode-tag">${MODES[x.mode]||x.mode}${used?' · '+esc(used.version):''}</span>`:''}${x?`<button id="withdraw" data-id="${x.id}" ${u.role!=='supervisor'||!['ready','failed','confirmed'].includes(x.state)?'disabled':''}>撤销未取样解释，返回重编</button>`:''}</div>`
    +`${x?.state==='queued'?'<div class="empty computing">worker正在按受理时钉住的'+(x.mode==='ruler'?'标尺版本':'固定随机种子')+'处理，页面会自动更新。</div>':''}`
    +`${x?.state==='failed'?`<p class="error">${esc(x.error)}。主管撤销失败记录后可重新提交。</p>`:''}`
    +(ev?.chosen_k||ev?.layer_types?`<div class="strata-layout"><section>${x.mode==='ruler'?rulerPanel(s,h,x,ev,u):gmmPanel(s,h,x,ev)}<h2>人工地层长柱</h2>${rows.map(r=>`<div class="stratum-record"><b>${x.mode==='ruler'?esc(r.layer_type)+' · ':''}${esc(r.lithology)}</b>${depthBand(r.start_m,r.end_m,h.total_depth)}<small>${esc(r.contact_note)}</small></div>`).join('')||'<div class="empty">将候选与岩芯实物对照，在右侧编录完整层段。</div>'}</section><aside><h2>接触面与岩性编录</h2><form id="contacts" data-id="${x.id}" data-mode="${x.mode}"><label>每行：起点,终点,${x.mode==='ruler'?'层型编号,':''}岩性,不少于8字依据<textarea name="layers" class="layers-input" required>${esc(text)}</textarea></label><p class="note">须从0连续到${h.total_depth}m，不能重叠或漏层。${x.mode==='ruler'?'层型编号必须沿用标尺（'+ev.layer_types.map(t=>t.layer_type).join('、')+'），待判点所在深度由人工判定归层。':'缺芯仍需上下岩性解释，不能伪造测点。'}</p><button ${u.role==='viewer'||x.state!=='ready'?'disabled':''}>保存人工接触面</button></form><button class="ochre" id="confirm" data-id="${x.id}" ${u.role!=='supervisor'||x.state!=='ready'?'disabled':''}>主管确认层面与岩性</button></aside></div>`:'<div class="field-note">本孔至少12个三项物性均有变化的测点。同工区已有标尺时新申请自动沿用标尺；无标尺时走本孔 GMM 拟合。拟合与队列失败会留原因；已确认并被取样引用的解释不可撤销。</div>');
}
export function bind(run,render,s){
    let b=document.getElementById('interpret');
    if(b)b.onclick=()=>run(()=>api('/interpretations','POST',{borehole_id:s.holeId}),'解释申请已排队，受理版本已钉住');
    let f=document.getElementById('contacts');
    if(f)f.onsubmit=e=>{e.preventDefault();run(()=>{let ruler=f.dataset.mode==='ruler';let layers=values(f).layers.split('\n').filter(x=>x.trim()).map(x=>{let[a,b,c,...d]=x.split(',');return ruler?{start_m:+a,end_m:+b,layer_type:(c||'').trim(),lithology:(d[0]||'').trim(),contact_note:d.slice(1).join(',')}:{start_m:+a,end_m:+b,lithology:c||'',contact_note:d.join(',')}});return api('/interpretations/'+f.dataset.id+'/contacts','PUT',{layers})},'人工接触面已保存，等待主管确认')};
    for(let id of['confirm','withdraw']){let btn=document.getElementById(id);if(btn)btn.onclick=()=>run(()=>api('/interpretations/'+btn.dataset.id+'/'+id,'POST'),id==='confirm'?'地层接触面已确认，可申请切样':'解释已撤销，可补测并重新解释')}
    let p=document.getElementById('ruler-publish');
    if(p)p.onsubmit=e=>{e.preventDefault();let d=values(p,['interpretation_id']);run(()=>api('/rulers','POST',d),'工区标尺已发布，旧版整版留档；新孔申请将沿用新版')};
}
