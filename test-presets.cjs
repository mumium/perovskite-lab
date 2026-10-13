const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'index.html':req.url.slice(1);
  if(!['index.html','app.js','presets.js','style.css'].includes(name)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'web',name)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  const edgePath='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath=process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||(process.platform==='win32'&&fs.existsSync(edgePath)?edgePath:undefined);
  browser=await chromium.launch({executablePath,headless:true});
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;await p.goto(url);
  const localToday=await p.evaluate(()=>new Date().toLocaleDateString('sv-SE'));
  const demo={batches:[{id:'b',name:'最近编辑的实验',date:'2025-01-01',status:'已完成',operator:'研究员',structure:'ITO / NiOx / PV / C60 / Ag',hypothesis:'比较退火温度',variables:'100 / 110 °C',notes:'旧异常',filledAt:100},{id:'other',name:'较早填写',operator:'旧人员',filledAt:1}],devices:[{id:'d',batchId:'b',name:'PV-001',composition:'本实验组分',group:'对照',variable:'100 °C',anneal:'100 °C / 30 min',spin:'5000 rpm / 30 s',substrate:'S-01',area:'0.1',notes:'旧缺陷',filledAt:50,results:[{id:'r',voc:'1.1',jsc:'24',ff:'80',pin:'100',area:'0.1'}]},{id:'taken',batchId:'b',name:'PV-002',composition:'早期组分',filledAt:1,results:[]},{id:'foreign',batchId:'other',name:'OTHER-001',composition:'其他实验组分',filledAt:200,results:[]}]};
  await p.evaluate(d=>localStorage.setItem('pv-lab-v1',JSON.stringify(d)),demo);await p.reload();
  const field=k=>p.locator(`[name="${k}"]`),save=()=>p.getByRole('button',{name:'保存记录',exact:true}).click(),cancel=()=>p.locator('#cancel').click();
  const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('pv-lab-v1')));
  async function checkLayout(kind){
   for(const width of [320,360,390,412,1280]){
    await p.setViewportSize({width,height:844});
    assert(await p.locator('#editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1),kind+' horizontal overflow');
    for(const block of await p.locator('.preset-block').all()){
     const input=await block.locator('input,select').boundingBox(),button=await block.locator('button').boundingBox();
     assert(Math.abs(input.x-button.x)<1&&Math.abs(input.width-button.width)<1,kind+' controls misaligned at '+width);
     assert(button.y>=input.y+input.height,kind+' controls must be stacked');
     assert(button.height>=48);assert(await block.locator('input,select').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
    }
    if(width<=760){const a=await p.locator('.preset-picker').boundingBox(),b=await p.locator('.preset-save').boundingBox();assert(Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1);assert(b.y>=a.y+a.height)}
   }
   await p.setViewportSize({width:390,height:844});await p.locator('#formBody').evaluate(e=>e.scrollTop=0);
   await p.screenshot({path:path.join(__dirname,`preview-${kind}-templates-0.3.1.png`),animations:'disabled'});
  }
  await p.locator('#newBatch').click();
  assert.equal(await field('operator').inputValue(),'研究员');assert.equal(await field('structure').inputValue(),demo.batches[0].structure);assert.equal(await field('name').inputValue(),'最近编辑的实验-续1');assert.equal(await field('date').inputValue(),localToday);assert.equal(await field('status').inputValue(),'进行中');assert.equal(await field('notes').inputValue(),'');
  await p.locator('.preset-tools>summary').click();await p.locator('#presetName').fill('常用实验');await p.locator('#savePreset').click();assert.equal((await read()).batches.length,2);await checkLayout('batch');await cancel();
  await p.locator('[data-batch="b"]').click();await p.locator('#addDevice').click();
  assert.equal(await field('name').inputValue(),'PV-003');assert.equal(await field('composition').inputValue(),'本实验组分');assert.equal(await field('spin').inputValue(),demo.devices[0].spin);assert.equal(await field('notes').inputValue(),'');
  await p.locator('.preset-tools>summary').click();assert.equal(await p.locator('#presetChoice option').count(),1,'batch templates leaked into device list');
  await field('anneal').fill('110 °C / 30 min');await field('notes').fill('通用检查备注');await p.locator('#presetName').fill('110度方案');await p.locator('#savePreset').click();
  let db=await read();assert.equal(db.devices.length,3);const preset=db.templates.find(t=>t.kind==='device');assert.equal(preset.values.anneal,'110 °C / 30 min');for(const k of ['name','id','date','status','results','batchId'])assert(!(k in preset.values));
  await p.locator('#presetName').fill('110度方案');await p.locator('#savePreset').click();assert.equal((await read()).templates.at(-1).name,'110度方案 2');
  await field('anneal').fill('手动未保存的改动');await p.locator('#presetChoice').selectOption(preset.id);assert.equal(await field('anneal').inputValue(),'手动未保存的改动','selecting alone overwrote input');
  await p.locator('#applyPreset').click();assert.equal(await field('anneal').inputValue(),'110 °C / 30 min');assert.equal(await field('name').inputValue(),'PV-003');
  await checkLayout('device');
  await p.locator('#presetSelected').evaluate(e=>e.textContent='已选：倒置结构钙钛矿小面积电池制备方案_旋涂5000rpm_110度退火_第二版常用条件');
  for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(await p.locator('#presetSelected').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'long template name overflow');assert(await p.locator('#editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1))}
  for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(await p.locator('#editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1));const box=await p.locator('#editor footer').boundingBox();assert(box.y+box.height<=845)}
  await p.setViewportSize({width:390,height:844});
  await cancel();assert.equal((await read()).devices.length,3);
  await p.locator('#addDevice').click();assert.equal(await field('anneal').inputValue(),'100 °C / 30 min','cancelled form became recent');
  await p.locator('.preset-tools>summary').click();await p.locator('#presetChoice').selectOption(preset.id);await p.locator('#applyPreset').click();await save();
  db=await read();const added=db.devices.at(-1);assert.equal(added.name,'PV-003');assert.equal(added.batchId,'b');assert.deepEqual(added.results,[]);assert.equal(added.notes,'通用检查备注');assert.equal(db.devices[0].anneal,'100 °C / 30 min');
  await p.reload();await p.locator('[data-batch="b"]').click();await p.locator('#addDevice').click();assert.equal(await field('name').inputValue(),'PV-004');assert.equal(await field('anneal').inputValue(),'110 °C / 30 min');assert.equal(await field('notes').inputValue(),'');await cancel();
  await p.locator('[data-device-details="d"]>summary').click();await p.locator('[data-edit="d"]').click();assert.equal(await field('anneal').inputValue(),'100 °C / 30 min','edit unexpectedly prefilled latest');
  await p.locator('.preset-tools>summary').click();await p.locator('#presetChoice').selectOption(preset.id);await p.locator('#applyPreset').click();await save();db=await read();assert.deepEqual(db.devices[0].results,demo.devices[0].results);assert.equal(db.devices[0].name,'PV-001');
  await p.getByRole('button',{name:'数据与同步',exact:true}).click();
  const waiting=p.waitForEvent('download');await p.locator('#json').click();const dl=await waiting;const chunks=[];for await(const c of await dl.createReadStream())chunks.push(c);const backup=JSON.parse(Buffer.concat(chunks).toString());assert.equal(backup.templates.length,3);
  await p.locator('#file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({batches:[],devices:[]}))});await p.getByRole('status').filter({hasText:'导入完成'}).waitFor();assert.equal((await read()).templates.length,3,'old backup cleared templates');
  const restored=await browser.newPage({viewport:{width:390,height:844}});await restored.goto(url);await restored.evaluate(()=>localStorage.clear());await restored.reload();await restored.getByRole('button',{name:'数据与同步',exact:true}).click();await restored.locator('#file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await restored.getByRole('status').filter({hasText:'导入完成'}).waitFor();assert.deepEqual(await restored.evaluate(()=>JSON.parse(localStorage.getItem('pv-lab-v1'))),backup);
  await restored.close();assert.deepEqual(errors,[]);
  console.log('PASS: recent saved experiment; current-batch conditions; unique names/date; cancel safety; named templates and kind isolation; explicit apply; 320/390px layout; independent records/results; refresh; old backup merge; full JSON restore');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
