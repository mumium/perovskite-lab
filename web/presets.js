// Reuse entered conditions without reusing record identities or measured results.
function recordFields(kind){return kind==='batch'?fieldsBatch:fieldsDevice}
function conditionValues(kind,source={},includeNotes=true){return Object.fromEntries(recordFields(kind).filter(([key])=>!['name','date','status'].includes(key)&&(includeNotes||key!=='notes')).map(([key])=>[key,String(source[key]??'')]))}
function recentRecord(kind,batchId){
 let rows=kind==='batch'?db.batches:db.devices;
 if(kind==='device'&&batchId){const same=rows.filter(d=>d.batchId===batchId);if(same.length)rows=same}
 return rows.reduce((last,row)=>Number(row.filledAt||0)>Number(last?.filledAt||0)?row:last,rows[rows.length-1]);
}
function nextRecordName(kind,source,batchId){
 const used=new Set((kind==='batch'?db.batches:db.devices.filter(d=>d.batchId===batchId)).map(x=>x.name));
 if(kind==='batch'){
  const base=String(source?.name||'实验-'+today()).replace(/-续\d+$/,'');
  if(!used.has(base))return base;
  let n=1;while(used.has(base+'-续'+n))n++;return base+'-续'+n;
 }
 const original=String(source?.name||'器件-000');
 const match=original.match(/^(.*?)(\d+)$/);
 const prefix=match?match[1]:original+'-';
 const width=match?match[2].length:3;
 let n=match?Number(match[2])+1:1;
 if(!Number.isSafeInteger(n)){n=1;}
 while(used.has(prefix+String(n).padStart(width,'0')))n++;
 return prefix+String(n).padStart(width,'0');
}
function newRecord(kind,batchId){
 const source=recentRecord(kind,batchId);
 const record={...conditionValues(kind,source,false),name:nextRecordName(kind,source,batchId)};
 if(kind==='batch')Object.assign(record,{date:today(),status:'进行中'});
 else Object.assign(record,{id:uid(),batchId,results:[]});
 return {record,source};
}
function saveRecord(kind,record,values){
 const rows=kind==='batch'?db.batches:db.devices,exists=rows.includes(record),before={...record};
 Object.assign(record,values,{filledAt:Date.now()});
 if(!record.id)record.id=uid();
 if(!exists)rows.push(record);
 if(save())return true;
 if(!exists)rows.pop();
 for(const key of Object.keys(record))delete record[key];Object.assign(record,before);
 return false;
}
function newBatch(){const {record,source}=newRecord('batch');form('新建实验批次',fieldsBatch,record,v=>saveRecord('batch',record,v),{kind:'batch',source})}
function newDevice(){const {record,source}=newRecord('device',selected);form('器件制备条件',fieldsDevice,record,v=>saveRecord('device',record,v),{kind:'device',source})}
function presetPanel(options){
 const label=options.kind==='batch'?'实验':'器件';
 const source=options.source?`已沿用「${esc(options.source.name)}」的${label==='实验'?'实验设计':'制备条件'}。请核对变量和批号，观察与异常备注留空。`:options.editing?'可将当前条件保存为模板，或主动应用其他模板。':'首次记录可直接填写，之后新建会自动带入最近条件。';
 return `<section class="preset-panel">
 <p class="prefill-hint">${source}</p>
 <details class="preset-tools"><summary>常用${label}模板</summary><div class="preset-content">
 <div class="preset-sections">
 <section class="preset-block preset-picker"><h3>使用已有模板</h3>
 <label>选择模板<select id="presetChoice" aria-label="选择模板"></select></label>
 <p id="presetSelected" class="preset-selected" hidden></p>
 <button type="button" id="applyPreset" class="primary">填入条件</button></section>
 <section class="preset-block preset-save"><h3>保存当前条件</h3>
 <label>模板名称（选填）<input id="presetName" placeholder="${options.kind==='batch'?'如：倒置结构实验':'如：常用旋涂工艺'}" maxlength="80"></label>
 <button type="button" id="savePreset">保存为模板</button>
 <p class="preset-caption">保存条件，不包含编号、日期或性能结果。</p></section>
 </div>
 <p id="presetHelp" class="preset-help" role="status">选择模板后填入条件，或将当前条件保存为新模板。</p>
 <details class="preset-maintenance"><summary>其他操作</summary><div class="preset-extra">
 <button type="button" id="clearConditions">清空表单条件</button>
 <button type="button" id="deletePreset" class="danger">删除所选模板</button>
 </div></details>
 </div></details></section>`;
}
function bindPresets(options){
 const kind=options.kind,fields=recordFields(kind),choice=$('#presetChoice');
 function refresh(value=''){
  const templates=(db.templates||[]).filter(t=>t.kind===kind);
  choice.innerHTML='<option value="">选择已保存的模板</option>'+templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  choice.value=value;showSelection();
  if(!templates.length)$('#presetHelp').textContent='还没有模板。填写常用条件后，点击“保存为模板”。';
 }
 const values=()=>Object.fromEntries(fields.map(([key])=>[key,$('#editForm').elements.namedItem(key).value]));
 function fill(source){for(const [key,value] of Object.entries(conditionValues(kind,source)))$('#editForm').elements.namedItem(key).value=value}
 function showSelection(){const preset=(db.templates||[]).find(t=>t.id===choice.value&&t.kind===kind);$('#applyPreset').disabled=!preset;$('#deletePreset').disabled=!preset;$('#presetSelected').hidden=!preset;$('#presetSelected').textContent=preset?'已选：'+preset.name:''}
 choice.onchange=showSelection;
 $('#applyPreset').onclick=()=>{const preset=(db.templates||[]).find(t=>t.id===choice.value&&t.kind===kind);if(!preset)return;fill(preset.values);$('#presetHelp').textContent='已填入「'+preset.name+'」，请核对本次变量和批号后保存记录。';toast('模板条件已填入')};
 $('#clearConditions').onclick=()=>{if(!confirm('清空当前表单的条件？编号、日期和状态会保留，已保存的记录不受影响。'))return;fill({});$('#presetHelp').textContent='条件已清空，可以重新填写或选择模板。'};
 $('#savePreset').onclick=()=>{
  const templates=db.templates||(db.templates=[]),names=new Set(templates.filter(t=>t.kind===kind).map(t=>t.name));
  const base=$('#presetName').value.trim()||(kind==='batch'?'实验模板':'器件模板');let name=base,n=2;while(names.has(name))name=base+' '+n++;
  const preset={id:uid(),kind,name,values:conditionValues(kind,values()),updatedAt:Date.now()};
  templates.push(preset);if(!save()){templates.pop();return}refresh(preset.id);$('#presetName').value='';$('#presetHelp').textContent='已保存「'+name+'」。新建或编辑时都可选择使用。';toast('模板已保存');
 };
 $('#deletePreset').onclick=()=>{const index=(db.templates||[]).findIndex(t=>t.id===choice.value&&t.kind===kind);if(index<0||!confirm('删除此模板？已建立的实验和器件不会改变。'))return;const [preset]=db.templates.splice(index,1);if(!save()){db.templates.splice(index,0,preset);return}refresh();$('#presetHelp').textContent='模板已删除，已建立的记录保留。';toast('模板已删除')};
 refresh();
}
