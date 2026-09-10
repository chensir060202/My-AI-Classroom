export type StructuredSimulationBoundary = 'clamp' | 'wrap' | 'bounce';

export interface StructuredSimulationVariable {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit: string;
  ratePerSecond: number;
  boundary: StructuredSimulationBoundary;
}

export interface StructuredSimulationPreset {
  name: string;
  values: Record<string, number>;
}

export interface StructuredSimulationUi {
  controlsTitle: string;
  presetsTitle: string;
  start: string;
  pause: string;
  resume: string;
  reset: string;
  restart: string;
  ready: string;
  running: string;
  paused: string;
  ended: string;
}

export interface StructuredSimulationSpec {
  type: 'simulation';
  version: 1;
  title: string;
  description: string;
  primaryVariable: string;
  variables: StructuredSimulationVariable[];
  presets: StructuredSimulationPreset[];
  ui: StructuredSimulationUi;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBoundary(value: unknown): StructuredSimulationBoundary {
  return value === 'wrap' || value === 'bounce' || value === 'clamp' ? value : 'clamp';
}

function normalizeVariable(value: unknown): StructuredSimulationVariable | null {
  if (!isRecord(value)) return null;

  const id = readText(value.id, 32);
  const label = readText(value.label, 80);
  const min = readFiniteNumber(value.min);
  const max = readFiniteNumber(value.max);
  const defaultValue = readFiniteNumber(value.default);
  if (!id || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(id) || !label) return null;
  if (min === null || max === null || defaultValue === null || min >= max) return null;

  const range = max - min;
  const rawStep = readFiniteNumber(value.step);
  const step = rawStep !== null && rawStep > 0 ? Math.min(rawStep, range) : range / 100;
  const rate = readFiniteNumber(value.ratePerSecond) ?? 0;
  const unit = typeof value.unit === 'string' ? value.unit.trim().slice(0, 20) : '';

  return {
    id,
    label,
    min,
    max,
    default: clamp(defaultValue, min, max),
    step,
    unit,
    ratePerSecond: rate,
    boundary: normalizeBoundary(value.boundary),
  };
}

function normalizeUi(value: unknown): StructuredSimulationUi | null {
  if (!isRecord(value)) return null;
  const keys = [
    'controlsTitle',
    'presetsTitle',
    'start',
    'pause',
    'resume',
    'reset',
    'restart',
    'ready',
    'running',
    'paused',
    'ended',
  ] as const;

  const ui = {} as StructuredSimulationUi;
  for (const key of keys) {
    const text = readText(value[key], 64);
    if (!text) return null;
    ui[key] = text;
  }
  return ui;
}

function normalizePresets(
  value: unknown,
  variables: StructuredSimulationVariable[],
): StructuredSimulationPreset[] {
  if (!Array.isArray(value)) return [];
  const variableMap = new Map(variables.map((variable) => [variable.id, variable] as const));
  const presets: StructuredSimulationPreset[] = [];

  for (const item of value.slice(0, 4)) {
    if (!isRecord(item) || !isRecord(item.values)) continue;
    const name = readText(item.name, 64);
    if (!name) continue;

    const values: Record<string, number> = {};
    for (const [id, rawValue] of Object.entries(item.values)) {
      const variable = variableMap.get(id);
      const numeric = readFiniteNumber(rawValue);
      if (!variable || numeric === null) continue;
      values[id] = clamp(numeric, variable.min, variable.max);
    }

    if (Object.keys(values).length > 0) presets.push({ name, values });
  }

  return presets;
}

/**
 * Validate and normalize the model-owned simulation description before it can
 * reach the deterministic renderer. Invalid or non-dynamic specs return null so
 * callers can safely fall back to the legacy free-form HTML generator.
 */
export function normalizeStructuredSimulationSpec(input: unknown): StructuredSimulationSpec | null {
  if (!isRecord(input)) return null;
  if (input.type !== undefined && input.type !== 'simulation') return null;

  const title = readText(input.title, 120);
  const description = readText(input.description, 500);
  const ui = normalizeUi(input.ui);
  if (!title || !description || !ui || !Array.isArray(input.variables)) return null;

  const variables: StructuredSimulationVariable[] = [];
  const seenIds = new Set<string>();
  for (const rawVariable of input.variables.slice(0, 6)) {
    const variable = normalizeVariable(rawVariable);
    if (!variable || seenIds.has(variable.id)) return null;
    seenIds.add(variable.id);
    variables.push(variable);
  }

  if (variables.length === 0) return null;
  const dynamicVariables = variables.filter((variable) => variable.ratePerSecond !== 0);
  if (dynamicVariables.length === 0) return null;

  const requestedPrimary = readText(input.primaryVariable, 32);
  const primaryVariable =
    requestedPrimary && dynamicVariables.some((variable) => variable.id === requestedPrimary)
      ? requestedPrimary
      : dynamicVariables[0].id;

  return {
    type: 'simulation',
    version: 1,
    title,
    description,
    primaryVariable,
    variables,
    presets: normalizePresets(input.presets, variables),
    ui,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Render a dependency-free, fixed simulation shell. The model supplies only the
 * validated spec; all state transitions, animation and reset behavior live here.
 */
export function renderStructuredSimulationHtml(spec: StructuredSimulationSpec): string {
  const config = {
    type: 'simulation',
    engine: 'structured-simulation-v1',
    version: spec.version,
    title: spec.title,
    primaryVariable: spec.primaryVariable,
    variables: spec.variables,
    presets: spec.presets,
  };
  const embeddedSpec = safeJson(spec);
  const embeddedConfig = safeJson(config);

  const controls = spec.variables
    .map(
      (variable) => `
        <label class="control" for="${escapeHtml(variable.id)}-slider">
          <span class="control-row"><span>${escapeHtml(variable.label)}</span><output id="${escapeHtml(variable.id)}-display"></output></span>
          <input id="${escapeHtml(variable.id)}-slider" data-var="${escapeHtml(variable.id)}" type="range" min="${variable.min}" max="${variable.max}" step="${variable.step}" value="${variable.default}" aria-label="${escapeHtml(variable.label)}">
        </label>`,
    )
    .join('');

  const presets = spec.presets
    .map(
      (preset, index) =>
        `<button class="secondary preset-btn" type="button" data-preset-index="${index}">${escapeHtml(preset.name)}</button>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.title)}</title>
<style>
:root{font-family:Inter,"Noto Sans SC","PingFang SC","PingFang TC","Microsoft YaHei","Microsoft JhengHei",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#f8fafc,#eef2f7);color:#172033}.app{min-height:100vh;display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:16px;padding:16px}.panel,.stage{background:rgba(255,255,255,.96);border:1px solid #dce3ed;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,.08)}.panel{padding:18px;overflow:auto}.stage{padding:18px;display:flex;flex-direction:column;min-height:420px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}.title{font-size:24px;line-height:1.2;margin:6px 0 8px}.description{margin:0 0 18px;color:#536174;line-height:1.55}.section-title{font-size:14px;font-weight:750;margin:18px 0 10px}.control{display:block;padding:12px 0;border-top:1px solid #edf1f6}.control:first-of-type{border-top:0}.control-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:650}.control output{font:600 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#334155}.control input[type=range]{width:100%;min-height:44px;accent-color:#4f46e5;touch-action:manipulation}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.presets{display:grid;gap:8px}.primary,.secondary{min-height:44px;border-radius:12px;border:1px solid transparent;font:700 14px inherit;cursor:pointer;touch-action:manipulation}.primary{background:#4f46e5;color:white}.secondary{background:#f8fafc;border-color:#d9e1ec;color:#243047}.primary:focus-visible,.secondary:focus-visible,input:focus-visible{outline:3px solid rgba(79,70,229,.25);outline-offset:2px}.statusbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.status{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:13px;font-weight:750}.status-dot{width:8px;height:8px;border-radius:999px;background:#6366f1}.canvas-wrap{position:relative;flex:1;min-height:340px;border-radius:14px;overflow:hidden;background:#0f172a}canvas{display:block;width:100%;height:100%;min-height:340px;touch-action:none}.hint{font-size:12px;color:#64748b}.teacher-annotation{position:fixed;background:rgba(79,70,229,.96);color:white;padding:8px 12px;border-radius:8px;font-size:14px;z-index:1000}@keyframes pulse-highlight{0%,100%{outline-color:rgba(79,70,229,.85)}50%{outline-color:rgba(79,70,229,.3)}}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.panel{max-height:48vh}.stage{min-height:380px}.canvas-wrap,canvas{min-height:300px}.title{font-size:21px}}
</style>
<script type="application/json" id="widget-config">${embeddedConfig}</script>
<script type="application/json" id="structured-simulation-spec">${embeddedSpec}</script>
</head>
<body>
<div class="app">
  <aside class="panel" id="controls">
    <div class="eyebrow">Structured Simulation</div>
    <h1 class="title">${escapeHtml(spec.title)}</h1>
    <p class="description">${escapeHtml(spec.description)}</p>
    <div class="section-title">${escapeHtml(spec.ui.controlsTitle)}</div>
    ${controls}
    ${spec.presets.length > 0 ? `<div class="section-title">${escapeHtml(spec.ui.presetsTitle)}</div><div class="presets">${presets}</div>` : ''}
    <div class="buttons">
      <button id="main-btn" class="primary" type="button">${escapeHtml(spec.ui.start)}</button>
      <button id="reset-btn" class="secondary" type="button">${escapeHtml(spec.ui.reset)}</button>
    </div>
  </aside>
  <main class="stage">
    <div class="statusbar">
      <div id="status" class="status"><span class="status-dot"></span><span id="status-text">${escapeHtml(spec.ui.ready)}</span></div>
      <div class="hint">Space · R</div>
    </div>
    <div class="canvas-wrap"><canvas id="simulation-canvas" aria-label="${escapeHtml(spec.title)}"></canvas></div>
  </main>
</div>
<script>
(function(){
  'use strict';
  const spec=JSON.parse(document.getElementById('structured-simulation-spec').textContent);
  const variablesById=new Map(spec.variables.map(function(v){return [v.id,v];}));
  const defaults=Object.fromEntries(spec.variables.map(function(v){return [v.id,v.default];}));
  const state={running:false,paused:false,ended:false,values:Object.assign({},defaults),directions:Object.fromEntries(spec.variables.map(function(v){return [v.id,1];}))};
  const canvas=document.getElementById('simulation-canvas');
  const ctx=canvas.getContext('2d');
  const mainBtn=document.getElementById('main-btn');
  const resetBtn=document.getElementById('reset-btn');
  const statusText=document.getElementById('status-text');
  let frameId=null;
  let lastTimestamp=0;

  function formatValue(value,step){
    const decimals=step>=1?0:Math.min(4,Math.max(1,Math.ceil(-Math.log10(step))));
    return Number(value).toFixed(decimals);
  }

  function clampValue(value,min,max){return Math.min(max,Math.max(min,value));}

  function setStatus(){
    if(state.running){statusText.textContent=spec.ui.running;mainBtn.textContent=spec.ui.pause;}
    else if(state.paused){statusText.textContent=spec.ui.paused;mainBtn.textContent=spec.ui.resume;}
    else if(state.ended){statusText.textContent=spec.ui.ended;mainBtn.textContent=spec.ui.restart;}
    else{statusText.textContent=spec.ui.ready;mainBtn.textContent=spec.ui.start;}
  }

  function syncControls(){
    spec.variables.forEach(function(v){
      const input=document.getElementById(v.id+'-slider');
      const output=document.getElementById(v.id+'-display');
      input.value=String(state.values[v.id]);
      output.textContent=formatValue(state.values[v.id],v.step)+(v.unit?' '+v.unit:'');
    });
  }

  function resizeCanvas(){
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    canvas.width=Math.max(1,Math.round(rect.width*dpr));
    canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    draw();
  }

  function draw(){
    const w=canvas.clientWidth;
    const h=canvas.clientHeight;
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#0f172a';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#e2e8f0';ctx.font='700 18px system-ui,sans-serif';ctx.fillText(spec.title,24,34);
    const primary=variablesById.get(spec.primaryVariable);
    const primaryValue=state.values[primary.id];
    const ratio=(primaryValue-primary.min)/(primary.max-primary.min);
    const trackX=36,trackY=88,trackW=Math.max(80,w-72);
    ctx.strokeStyle='#475569';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trackX,trackY);ctx.lineTo(trackX+trackW,trackY);ctx.stroke();
    ctx.strokeStyle='#818cf8';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(trackX,trackY);ctx.lineTo(trackX+trackW*ratio,trackY);ctx.stroke();
    const orbX=trackX+trackW*ratio;
    ctx.fillStyle=state.running?'#f8fafc':'#cbd5e1';ctx.beginPath();ctx.arc(orbX,trackY,13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#cbd5e1';ctx.font='600 13px ui-monospace,monospace';ctx.fillText(primary.label+': '+formatValue(primaryValue,primary.step)+(primary.unit?' '+primary.unit:''),36,120);

    const startY=158;
    const rowGap=Math.max(46,Math.min(62,(h-startY-20)/Math.max(1,spec.variables.length)));
    spec.variables.forEach(function(v,index){
      const y=startY+index*rowGap;
      const value=state.values[v.id];
      const r=(value-v.min)/(v.max-v.min);
      const label=v.label+'  '+formatValue(value,v.step)+(v.unit?' '+v.unit:'');
      ctx.fillStyle='#94a3b8';ctx.font='600 12px system-ui,sans-serif';ctx.fillText(label,36,y);
      ctx.fillStyle='#1e293b';ctx.fillRect(36,y+11,Math.max(80,w-72),10);
      ctx.fillStyle=v.id===spec.primaryVariable?'#818cf8':'#38bdf8';ctx.fillRect(36,y+11,Math.max(0,(w-72)*r),10);
    });
  }

  function render(){syncControls();setStatus();draw();}

  function stopLoop(){
    if(frameId!==null){cancelAnimationFrame(frameId);frameId=null;}
    lastTimestamp=0;
  }

  function resetSimulation(){
    stopLoop();
    state.running=false;state.paused=false;state.ended=false;
    state.values=Object.assign({},defaults);
    state.directions=Object.fromEntries(spec.variables.map(function(v){return [v.id,1];}));
    render();
  }

  function advanceVariable(v,dt){
    if(!v.ratePerSecond)return;
    let next=state.values[v.id]+v.ratePerSecond*state.directions[v.id]*dt;
    const range=v.max-v.min;
    if(v.boundary==='wrap'){
      next=((next-v.min)%range+range)%range+v.min;
    }else if(v.boundary==='bounce'){
      if(next>v.max){next=v.max-(next-v.max);state.directions[v.id]*=-1;}
      if(next<v.min){next=v.min+(v.min-next);state.directions[v.id]*=-1;}
      next=clampValue(next,v.min,v.max);
    }else{
      next=clampValue(next,v.min,v.max);
    }
    state.values[v.id]=next;
  }

  function allClampDynamicsEnded(){
    const dynamic=spec.variables.filter(function(v){return v.ratePerSecond!==0;});
    if(dynamic.some(function(v){return v.boundary!=='clamp';}))return false;
    return dynamic.every(function(v){
      const value=state.values[v.id];
      return v.ratePerSecond>0?value>=v.max:value<=v.min;
    });
  }

  function tick(timestamp){
    frameId=null;
    if(!state.running)return;
    if(!lastTimestamp)lastTimestamp=timestamp;
    const dt=Math.min(.1,Math.max(0,(timestamp-lastTimestamp)/1000));
    lastTimestamp=timestamp;
    spec.variables.forEach(function(v){advanceVariable(v,dt);});
    if(allClampDynamicsEnded()){
      state.running=false;state.ended=true;lastTimestamp=0;render();return;
    }
    render();
    frameId=requestAnimationFrame(tick);
  }

  function startSimulation(){
    if(state.ended)resetSimulation();
    if(state.running)return;
    state.running=true;state.paused=false;state.ended=false;lastTimestamp=0;setStatus();draw();
    if(frameId===null)frameId=requestAnimationFrame(tick);
  }

  function pauseSimulation(){
    if(!state.running)return;
    state.running=false;state.paused=true;stopLoop();render();
  }

  function resumeSimulation(){
    if(!state.paused)return;
    state.paused=false;startSimulation();
  }

  function handleMainButton(){
    if(state.running)pauseSimulation();
    else if(state.paused)resumeSimulation();
    else startSimulation();
  }

  function applyPreset(index){
    const preset=spec.presets[index];if(!preset)return;
    resetSimulation();
    Object.entries(preset.values).forEach(function(entry){
      const v=variablesById.get(entry[0]);if(v)state.values[v.id]=clampValue(Number(entry[1]),v.min,v.max);
    });
    render();
  }

  spec.variables.forEach(function(v){
    const input=document.getElementById(v.id+'-slider');
    input.addEventListener('input',function(){state.values[v.id]=clampValue(Number(input.value),v.min,v.max);render();});
  });
  document.querySelectorAll('[data-preset-index]').forEach(function(button){
    button.addEventListener('click',function(){applyPreset(Number(button.getAttribute('data-preset-index')));});
  });
  mainBtn.addEventListener('click',handleMainButton);
  resetBtn.addEventListener('click',resetSimulation);
  window.addEventListener('keydown',function(event){
    if(event.code==='Space'&&event.target===document.body){event.preventDefault();handleMainButton();}
    if((event.key==='r'||event.key==='R')&&event.target===document.body){event.preventDefault();resetSimulation();}
  });
  window.addEventListener('message',function(event){
    const data=event.data||{};
    if(data.type==='SET_WIDGET_STATE'&&data.state&&typeof data.state==='object'){
      Object.entries(data.state).forEach(function(entry){const v=variablesById.get(entry[0]);const n=Number(entry[1]);if(v&&Number.isFinite(n))state.values[v.id]=clampValue(n,v.min,v.max);});render();
    }else if(data.type==='HIGHLIGHT_ELEMENT'&&typeof data.target==='string'){
      const el=document.querySelector(data.target);if(el){el.style.outline='3px solid rgba(79,70,229,.85)';el.style.outlineOffset='4px';el.style.animation='pulse-highlight 2s infinite';setTimeout(function(){el.style.outline='';el.style.animation='';},3000);}
    }else if(data.type==='ANNOTATE_ELEMENT'&&typeof data.target==='string'&&typeof data.content==='string'){
      const el=document.querySelector(data.target);if(el){const rect=el.getBoundingClientRect();const tip=document.createElement('div');tip.className='teacher-annotation';tip.textContent=data.content;tip.style.top=Math.max(8,rect.top-44)+'px';tip.style.left=Math.max(8,rect.left)+'px';document.body.appendChild(tip);setTimeout(function(){tip.remove();},4000);}
    }else if(data.type==='REVEAL_ELEMENT'&&typeof data.target==='string'){
      const el=document.querySelector(data.target);if(el){el.style.display='';el.style.opacity='1';}
    }
  });
  if(typeof ResizeObserver!=='undefined'){new ResizeObserver(resizeCanvas).observe(canvas);}else{window.addEventListener('resize',resizeCanvas);}
  render();resizeCanvas();
})();
</script>
</body>
</html>`;
}
