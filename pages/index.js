/**
 * TideNet — Single-file Next.js app
 * Landing page + simulación completa en un solo archivo.
 * Coloca este archivo en pages/index.js de cualquier proyecto Next.js.
 * Único requisito: next, react, react-dom
 *
 * npx create-next-app@latest tidenet --js --no-tailwind --no-eslint --no-src-dir --no-app
 * cp este-archivo tidenet/pages/index.js
 * cd tidenet && npm run dev
 */

import Head from "next/head";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// 1. CONSTANTES
// ═══════════════════════════════════════════════════════════════════
const PHASE_DUR    = 30_000;
const TICK_MS      = 200;
const TRAIL_LEN    = 14;
const CURR_COUNT   = 9;
const MAX_CURRENTS = 14;

const AGENT_CFG = {
  surfer:    { color: "#00d4ff", size: 5,   maxSpeed: 3.2 },
  diver:     { color: "#8b5cf6", size: 4.5, maxSpeed: 2.2 },
  predictor: { color: "#fbbf24", size: 6,   maxSpeed: 2.6 },
  anchor:    { color: "#f87171", size: 8,   maxSpeed: 0.4 },
};

const AGENT_COUNTS = { surfer: 12, diver: 10, predictor: 8, anchor: 6 };

const TYPE_META = [
  { type: "surfer",    color: "#00d4ff", label: "Surfer"    },
  { type: "diver",     color: "#8b5cf6", label: "Diver"     },
  { type: "predictor", color: "#fbbf24", label: "Predictor" },
  { type: "anchor",    color: "#f87171", label: "Anchor"    },
];

// ═══════════════════════════════════════════════════════════════════
// 2. MOTOR DE SIMULACIÓN (clases puras, sin React)
// ═══════════════════════════════════════════════════════════════════

class Agent {
  constructor(id, type, x, y) {
    this.id = id; this.type = type; this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.energy = 70 + Math.random() * 50;
    this.knowledge = []; this.maxKnowledge = 18;
    this.score = 0; this.age = 0; this.trail = [];
    this.pulse = 0; this.prediction = null; this.predictionTick = 0;
    this.visible = true;
  }
  get cfg()   { return AGENT_CFG[this.type]; }
  get color() { return this.cfg.color; }
  get r()     { return this.cfg.size * (0.85 + (this.energy / 200) * 0.3); }

  step(sim) {
    if (!this.visible) return;
    this.age++;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_LEN) this.trail.shift();
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - 0.04);

    const hi = sim.phase === "HIGH";
    const sm = hi ? 1.6 : 0.45;

    if      (this.type === "surfer")    this._surfer(sim);
    else if (this.type === "diver")     this._diver(sim);
    else if (this.type === "predictor") this._predictor(sim, hi);
    else if (this.type === "anchor")    this._anchor(sim);

    const spd = Math.hypot(this.vx, this.vy);
    const maxV = this.cfg.maxSpeed * sm;
    if (spd > maxV && spd > 0) { this.vx = this.vx/spd*maxV; this.vy = this.vy/spd*maxV; }

    this.x += this.vx; this.y += this.vy;
    if (this.x < 8 || this.x > sim.W - 8) this.vx *= -1;
    if (this.y < 8 || this.y > sim.H - 8) this.vy *= -1;
    this.x = Math.max(8, Math.min(sim.W - 8, this.x));
    this.y = Math.max(8, Math.min(sim.H - 8, this.y));

    const decay = (hi ? 0.09 : 0.025) + Math.abs(this.vx + this.vy) * 0.005;
    this.energy = Math.max(5, Math.min(160, this.energy - decay));
    this._collect(sim);
  }

  _surfer(sim) {
    let best = null, bestS = 0;
    for (const c of sim.currents) {
      const d = Math.hypot(c.x - this.x, c.y - this.y);
      if (d < 140 && c.strength > bestS) { bestS = c.strength; best = c; }
    }
    if (best) {
      const dx = best.x - this.x, dy = best.y - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx += dx/d*0.5; this.vy += dy/d*0.5;
    } else { this.vx += (Math.random()-0.5)*0.35; this.vy += (Math.random()-0.5)*0.35; }
  }

  _diver(sim) {
    let crowd = 0, cx = 0, cy = 0;
    for (const a of sim.agents) {
      if (a.id === this.id) continue;
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      if (d < 90) { crowd++; cx += a.x; cy += a.y; }
    }
    if (crowd > 2) {
      const dx = this.x - cx/crowd, dy = this.y - cy/crowd, d = Math.hypot(dx, dy) || 1;
      this.vx += dx/d*0.35; this.vy += dy/d*0.35;
    } else { this.vx += (Math.random()-0.5)*0.22; this.vy += (Math.random()-0.5)*0.22; }
  }

  _predictor(sim, hi) {
    const next = sim.phase === "HIGH" ? "LOW" : "HIGH";
    const tLeft = PHASE_DUR - sim.phaseTimer;
    if (tLeft < 7000) {
      if (next === "HIGH" && sim.currents.length > 0) {
        let cx = 0, cy = 0;
        for (const c of sim.currents) { cx += c.x; cy += c.y; }
        cx /= sim.currents.length; cy /= sim.currents.length;
        const dx = cx - this.x, dy = cy - this.y, d = Math.hypot(dx, dy) || 1;
        this.vx += dx/d*0.25; this.vy += dy/d*0.25;
      } else { this.vx += (Math.random()-0.5)*0.5; this.vy += (Math.random()-0.5)*0.5; }
      if (!this.prediction) { this.prediction = next; this.predictionTick = sim.ticks; }
    } else { this.vx += (Math.random()-0.5)*0.28; this.vy += (Math.random()-0.5)*0.28; }
    if (this.prediction && sim.phase === this.prediction && sim.ticks - this.predictionTick < 80) {
      this.energy += 6; this.score += 12; this.pulse = 1;
      sim.addLog(`🔮 Predictor #${this.id} acertó! +12pts`);
      this.prediction = null;
    }
  }

  _anchor(sim) {
    this.vx *= 0.88; this.vy *= 0.88;
    if (sim.ticks % 8 === 0) {
      this.knowledge.push({ v: Math.random(), t: sim.ticks });
      if (this.knowledge.length > this.maxKnowledge) this.knowledge.shift();
      this.energy += 0.6; this.score += 1;
    }
  }

  _collect(sim) {
    for (const c of sim.currents) {
      if (Math.hypot(c.x - this.x, c.y - this.y) < 55 && c.sigs.length > 0) {
        const sig = c.sigs.shift();
        this.knowledge.push(sig);
        if (this.knowledge.length > this.maxKnowledge) this.knowledge.shift();
        this.energy += 2.5; this.score += 3; this.pulse = 0.6;
        if (Math.random() < 0.28) c.sigs.push({ v: Math.random(), src: this.id, t: sim.ticks });
      }
    }
  }
}

class Current {
  constructor(id, x, y, angle, strength) {
    this.id = id; this.x = x; this.y = y; this.angle = angle; this.strength = strength;
    this.length = 70 + Math.random() * 130;
    this.sigs = Array.from({ length: Math.floor(Math.random()*4+1) }, () => ({ v: Math.random(), src: -1, t: 0 }));
    this.pts = Array.from({ length: 10 }, () => ({
      t: Math.random(), spd: 0.0025 + Math.random()*0.004,
      a: 0.35 + Math.random()*0.5, r: 1.2 + Math.random()*1.8,
    }));
    this.age = 0; this.maxAge = 350 + Math.random()*250 | 0;
  }

  step(phase) {
    this.age++;
    const sm = phase === "HIGH" ? 1.7 : 0.55;
    for (const p of this.pts) { p.t += p.spd * sm; if (p.t > 1) p.t = 0; }
    const perp = this.angle + Math.PI/2;
    this.x += Math.cos(perp) * 0.12; this.y += Math.sin(perp) * 0.12;
  }

  draw(ctx) {
    const ex = this.x + Math.cos(this.angle)*this.length;
    const ey = this.y + Math.sin(this.angle)*this.length;
    const g = ctx.createLinearGradient(this.x, this.y, ex, ey);
    g.addColorStop(0,   "rgba(0,140,255,0)");
    g.addColorStop(0.2, `rgba(0,170,255,${0.12*this.strength})`);
    g.addColorStop(0.5, `rgba(0,200,255,${0.20*this.strength})`);
    g.addColorStop(0.8, `rgba(0,170,255,${0.12*this.strength})`);
    g.addColorStop(1,   "rgba(0,140,255,0)");
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(ex, ey);
    ctx.strokeStyle = g; ctx.lineWidth = 1.5 + this.strength*2; ctx.stroke();
    for (const p of this.pts) {
      const px = this.x + Math.cos(this.angle)*this.length*p.t;
      const py = this.y + Math.sin(this.angle)*this.length*p.t;
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(80,200,255,${p.a})`; ctx.fill();
    }
    for (let i = 0; i < this.sigs.length; i++) {
      const t = (i+0.5)/Math.max(this.sigs.length,1);
      ctx.beginPath();
      ctx.arc(this.x+Math.cos(this.angle)*this.length*t, this.y+Math.sin(this.angle)*this.length*t, 2.5, 0, Math.PI*2);
      ctx.fillStyle = "rgba(255,210,50,0.75)"; ctx.fill();
    }
  }
}

class TideNet {
  constructor(canvas) {
    this.cvs = canvas; this.ctx = canvas.getContext("2d");
    this.W = canvas.width; this.H = canvas.height;
    this.agents = []; this.currents = [];
    this.phase = "HIGH"; this.phaseTimer = 0; this.ticks = 0;
    this.running = false; this.speed = 2;
    this.vis = { surfer: true, diver: true, predictor: true, anchor: true };
    this.log = []; this._lastTick = 0; this._rafId = null; this._bgDots = [];
    this.onStateChange = null;
    this._init();
  }

  _init() {
    this.agents = []; this.currents = [];
    let id = 0;
    for (const [type, n] of Object.entries(AGENT_COUNTS))
      for (let i = 0; i < n; i++)
        this.agents.push(new Agent(id++, type, 20+Math.random()*(this.W-40), 20+Math.random()*(this.H-40)));
    for (let i = 0; i < CURR_COUNT; i++) this._spawnCurrent(i);
    this._bgDots = Array.from({length:55}, () => ({
      x: Math.random()*this.W, y: Math.random()*this.H,
      r: Math.random()*1.4+0.4, a: Math.random()*0.25+0.05,
    }));
    this.phase = "HIGH"; this.phaseTimer = 0; this.ticks = 0; this.log = []; this._lastTick = 0;
    this.addLog("🚀 TideNet inicializado");
    this.addLog("🌊 MAREA ALTA — agentes energizados");
  }

  _spawnCurrent(id) {
    this.currents.push(new Current(id, Math.random()*this.W, Math.random()*this.H,
      Math.random()*Math.PI*2,
      this.phase === "HIGH" ? 0.6+Math.random()*0.8 : 0.2+Math.random()*0.4));
  }

  addLog(msg) {
    this.log.unshift({ msg, t: this.ticks });
    if (this.log.length > 24) this.log.pop();
  }

  start()   { this.running = true; this._lastTick = 0; this._loop(); }
  pause()   { this.running = false; if (this._rafId) cancelAnimationFrame(this._rafId); }
  reset()   { this.pause(); this._init(); this.onStateChange?.(); }
  destroy() { this.pause(); }
  resize(w, h) { this.W = w; this.H = h; }
  setSpeed(v) { this.speed = +v; }
  toggleVis(type, on) { this.vis[type] = on; }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    if (now - this._lastTick >= TICK_MS / this.speed) { this._tick(); this._lastTick = now; }
    this._draw();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _tick() {
    this.ticks++; this.phaseTimer += TICK_MS;
    if (this.phaseTimer >= PHASE_DUR) {
      this.phaseTimer = 0;
      this.phase = this.phase === "HIGH" ? "LOW" : "HIGH";
      this.addLog(`🌊 Marea → ${this.phase === "HIGH" ? "ALTA" : "BAJA"}`);
      for (const c of this.currents)
        c.strength = this.phase === "HIGH" ? 0.65+Math.random()*0.8 : 0.18+Math.random()*0.4;
    }
    this.currents = this.currents.filter(c => c.age < c.maxAge);
    const target = CURR_COUNT + (this.phase === "HIGH" ? 2 : 0);
    while (this.currents.length < target) this._spawnCurrent(this.currents.length + (Date.now()&0xffff));
    for (const c of this.currents) {
      c.step(this.phase);
      if (Math.random() < 0.012 && c.sigs.length < 9) c.sigs.push({ v: Math.random(), src: -1, t: this.ticks });
    }
    if (this.ticks % 55 === 0 && this.currents.length < MAX_CURRENTS) {
      this._spawnCurrent(Date.now()&0xffff);
      if (Math.random() < 0.4) this.addLog("🌀 Nueva corriente");
    }
    for (const a of this.agents) { a.visible = this.vis[a.type]; a.step(this); }
    this.onStateChange?.();
  }

  _draw() {
    const { ctx, W, H } = this;
    ctx.fillStyle = "#020c18"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,70,130,0.10)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    for (const d of this._bgDots) {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(80,160,255,${d.a})`; ctx.fill();
    }
    for (const c of this.currents) c.draw(ctx);
    for (const a of this.agents) {
      if (!a.visible) continue;
      if (a.trail.length > 1) {
        ctx.beginPath(); ctx.moveTo(a.trail[0].x, a.trail[0].y);
        for (let i = 1; i < a.trail.length; i++) ctx.lineTo(a.trail[i].x, a.trail[i].y);
        ctx.strokeStyle = a.color+"22"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (a.pulse > 0) {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r+14*a.pulse, 0, Math.PI*2);
        ctx.strokeStyle = a.color + Math.floor(a.pulse*80).toString(16).padStart(2,"0");
        ctx.lineWidth = 2; ctx.stroke();
      }
      const grd = ctx.createRadialGradient(a.x,a.y,0,a.x,a.y,a.r*4);
      grd.addColorStop(0, a.color+"44"); grd.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r*4, 0, Math.PI*2); ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI*2); ctx.fillStyle = a.color; ctx.fill();
      if (a.knowledge.length > 1) {
        const arc = (a.knowledge.length / a.maxKnowledge) * Math.PI*2;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r+4, -Math.PI/2, -Math.PI/2+arc);
        ctx.strokeStyle = "#fbbf2455"; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }

  getSnapshot() {
    const counts = { surfer:0, diver:0, predictor:0, anchor:0 };
    for (const a of this.agents) counts[a.type]++;
    const vis = this.agents.filter(a => a.visible);
    const avgEnergy = vis.length ? vis.reduce((s,a) => s+a.energy, 0)/vis.length : 0;
    return {
      phase: this.phase, phaseTimer: this.phaseTimer,
      phasePct: this.phaseTimer/PHASE_DUR*100, ticks: this.ticks,
      running: this.running, counts,
      avgEnergy: avgEnergy.toFixed(1),
      sigTotal: this.currents.reduce((s,c) => s+c.sigs.length, 0),
      currCount: this.currents.length,
      top5: [...this.agents].sort((a,b) => b.score-a.score).slice(0,5)
        .map(a => ({ id:a.id, type:a.type, color:a.color, score:Math.round(a.score), energy:a.energy })),
      log: this.log.slice(0, 10),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. HOOK useSimulation
// ═══════════════════════════════════════════════════════════════════
function useSimulation(canvasRef) {
  const engineRef = useRef(null);
  const [snap, setSnap]       = useState(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = canvas.parentElement?.clientWidth  || 800;
    canvas.height = canvas.parentElement?.clientHeight || 600;
    const engine = new TideNet(canvas);
    engine.onStateChange = () => setSnap(engine.getSnapshot());
    engineRef.current = engine;
    engine.start();
    setPlaying(true);
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const w = canvas.parentElement?.clientWidth  || 800;
      const h = canvas.parentElement?.clientHeight || 600;
      canvas.width = w; canvas.height = h;
      engineRef.current?.resize(w, h);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  const togglePlay = useCallback(() => {
    const eng = engineRef.current; if (!eng) return;
    if (eng.running) { eng.pause(); setPlaying(false); }
    else             { eng.start(); setPlaying(true);  }
  }, []);
  const reset     = useCallback(() => { const e = engineRef.current; if (!e) return; e.reset(); e.start(); setPlaying(true); }, []);
  const setSpeed  = useCallback(v => engineRef.current?.setSpeed(v), []);
  const toggleVis = useCallback((t,on) => engineRef.current?.toggleVis(t,on), []);
  return { snap, playing, togglePlay, reset, setSpeed, toggleVis };
}

// ═══════════════════════════════════════════════════════════════════
// 4. ANIMACIÓN FONDO HERO
// ═══════════════════════════════════════════════════════════════════
function useHeroBg(bgRef) {
  useEffect(() => {
    const cvs = bgRef.current; if (!cvs) return;
    const ctx = cvs.getContext("2d");
    let raf;
    const resize = () => { cvs.width = cvs.offsetWidth; cvs.height = cvs.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    const waves = Array.from({length:7}, (_,i) => ({
      y:0.2+i*0.09, amp:14+i*5, freq:0.003+i*0.0015, phase:i*0.5, spd:0.012+i*0.005, alpha:0.04+i*0.025,
    }));
    const pts = Array.from({length:90}, () => ({
      x:Math.random(), y:Math.random(), vx:(Math.random()-0.5)*0.0006, vy:(Math.random()-0.5)*0.0006,
      r:Math.random()*2.2+0.6, a:Math.random()*0.35+0.08, hue:Math.random()>0.7?195:Math.random()>0.5?210:220,
    }));
    let t = 0;
    function frame() {
      const W = cvs.width, H = cvs.height;
      ctx.clearRect(0, 0, W, H); t++;
      for (const w of waves) {
        ctx.beginPath();
        for (let x=0; x<=W; x+=4) {
          const y = w.y*H + Math.sin(x*w.freq + t*w.spd + w.phase)*w.amp;
          x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        }
        ctx.strokeStyle = `rgba(0,190,255,${w.alpha})`; ctx.lineWidth=1; ctx.stroke();
      }
      for (const p of pts) {
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0)p.x=1; if(p.x>1)p.x=0; if(p.y<0)p.y=1; if(p.y>1)p.y=0;
      }
      for (let i=0;i<pts.length;i++) {
        for (let j=i+1;j<pts.length;j++) {
          const dx=(pts[i].x-pts[j].x)*W, dy=(pts[i].y-pts[j].y)*H, d=Math.hypot(dx,dy);
          if (d<90) {
            ctx.beginPath(); ctx.moveTo(pts[i].x*W,pts[i].y*H); ctx.lineTo(pts[j].x*W,pts[j].y*H);
            ctx.strokeStyle=`rgba(0,180,255,${(1-d/90)*0.13})`; ctx.lineWidth=0.5; ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x*W,p.y*H,p.r,0,Math.PI*2);
        ctx.fillStyle=`hsla(${p.hue},80%,65%,${p.a})`; ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    frame();
    return () => { window.removeEventListener("resize",resize); cancelAnimationFrame(raf); };
  }, []);
}

// ═══════════════════════════════════════════════════════════════════
// 5. COMPONENTES REUTILIZABLES
// ═══════════════════════════════════════════════════════════════════

// Colores & helpers de estilo
const S = {
  ink:    "#020c18", abyss: "#040f20", deep: "#071a30", ocean: "#0b2545",
  foam:   "#00d4ff", shimmer: "#67e8f9", pearl: "#e0f7ff", muted: "#4a7fa5",
  border: "rgba(0,212,255,0.12)",
  mono:   "'JetBrains Mono', monospace",
  syne:   "'Syne', sans-serif",
};

function Eyebrow({ children, center }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16,
      fontFamily:S.mono, fontSize:11, letterSpacing:3, textTransform:"uppercase", color:S.foam,
      justifyContent: center ? "center" : "flex-start" }}>
      <span style={{ width:24, height:1, background:S.foam, display:"inline-block" }} />
      {children}
    </div>
  );
}

function BtnFoam({ children, onClick, href }) {
  const base = {
    fontFamily:S.mono, fontSize:13, fontWeight:500, letterSpacing:0.5,
    background:S.foam, color:S.ink, border:"none",
    padding:"13px 28px", borderRadius:3, cursor:"pointer",
    textDecoration:"none", display:"inline-block", transition:"all 0.2s",
  };
  if (href) return <a href={href} style={base}
    onMouseEnter={e=>{e.currentTarget.style.background=S.shimmer; e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.background=S.foam; e.currentTarget.style.transform="none";}}>{children}</a>;
  return <button onClick={onClick} style={base}
    onMouseEnter={e=>{e.currentTarget.style.background=S.shimmer; e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.background=S.foam; e.currentTarget.style.transform="none";}}>{children}</button>;
}

function BtnGhost({ children, href }) {
  const base = {
    fontFamily:S.mono, fontSize:13, fontWeight:500, letterSpacing:0.5,
    background:"transparent", color:S.pearl,
    border:"1px solid rgba(255,255,255,0.18)",
    padding:"13px 28px", borderRadius:3, cursor:"pointer",
    textDecoration:"none", display:"inline-block", transition:"all 0.2s",
  };
  return <a href={href} style={base}
    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.45)"; e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.18)"; e.currentTarget.style.transform="none";}}>{children}</a>;
}

function PanelBlock({ label, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.025)", border:`1px solid ${S.border}`, borderRadius:6, padding:12 }}>
      <div style={{ fontFamily:S.mono, fontSize:9, letterSpacing:3, textTransform:"uppercase",
        color:S.foam, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
        {label}
        <span style={{ flex:1, height:1, background:S.border, display:"inline-block" }} />
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 6. COMPONENTES — LANDING
// ═══════════════════════════════════════════════════════════════════

function Nav({ onSimClick }) {
  return (
    <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"0 40px", height:60, background:"rgba(2,12,24,0.88)", backdropFilter:"blur(16px)",
      borderBottom:`1px solid ${S.border}` }}>
      <span style={{ fontSize:"1.3rem", fontWeight:800, letterSpacing:"-0.5px",
        background:`linear-gradient(135deg,${S.pearl} 20%,${S.foam} 70%,${S.shimmer})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
        ⬡ TideNet
      </span>
      <ul style={{ display:"flex", gap:28, listStyle:"none", margin:0, padding:0 }}>
        {[["Sistema","#concepts"],["Agentes","#agents"],["Cómo Funciona","#how"]].map(([l,h]) => (
          <li key={h}><a href={h} style={{ color:S.muted, textDecoration:"none", fontSize:13, fontWeight:700, transition:"color 0.2s" }}
            onMouseEnter={e=>e.target.style.color=S.foam} onMouseLeave={e=>e.target.style.color=S.muted}>{l}</a></li>
        ))}
      </ul>
      <button onClick={onSimClick} style={{ fontFamily:S.mono, fontSize:12, letterSpacing:1,
        background:"transparent", color:S.foam, border:`1px solid rgba(0,212,255,0.35)`,
        padding:"7px 18px", borderRadius:4, cursor:"pointer", transition:"all 0.2s" }}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(0,212,255,0.1)"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        LANZAR_SIM →
      </button>
    </nav>
  );
}

function Hero({ bgRef, onSimClick }) {
  return (
    <section style={{ position:"relative", height:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", overflow:"hidden", paddingTop:60 }}>
      <canvas ref={bgRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} />
      <div style={{ position:"relative", zIndex:10, textAlign:"center", padding:"0 24px",
        display:"flex", flexDirection:"column", alignItems:"center" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8,
          fontFamily:S.mono, fontSize:11, letterSpacing:3, color:S.foam, textTransform:"uppercase",
          background:"rgba(0,212,255,0.06)", border:`1px solid rgba(0,212,255,0.2)`,
          padding:"6px 16px", borderRadius:2, marginBottom:28 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:S.foam,
            animation:"pulseDot 1.5s ease-in-out infinite", display:"inline-block" }} />
          Plataforma Multi-Agente · v1.0
        </div>
        <h1 style={{ fontSize:"clamp(4rem,11vw,9rem)", fontWeight:800, lineHeight:0.9,
          letterSpacing:"-3px", marginBottom:12,
          background:`linear-gradient(160deg,${S.pearl} 0%,${S.shimmer} 35%,${S.foam} 60%,#1a6fb0 100%)`,
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          TideNet
        </h1>
        <p style={{ fontFamily:S.mono, fontSize:"clamp(0.75rem,1.5vw,1rem)", color:S.muted,
          letterSpacing:3, textTransform:"uppercase", marginBottom:28 }}>
          La inteligencia fluye como el océano
        </p>
        <p style={{ fontSize:"clamp(1rem,1.5vw,1.15rem)", color:"rgba(224,247,255,0.6)",
          maxWidth:540, margin:"0 auto 40px", lineHeight:1.7, fontWeight:400 }}>
          Simulación multi-agente donde entidades autónomas se comportan como mareas oceánicas:
          creciendo, decreciendo y transportando conocimiento por corrientes dinámicas.
        </p>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
          <BtnFoam onClick={onSimClick}>▶ INICIAR SIMULACIÓN</BtnFoam>
          <BtnGhost href="#concepts">EXPLORAR SISTEMA</BtnGhost>
        </div>
      </div>
      <div style={{ position:"absolute", bottom:32, left:"50%",
        animation:"bob 2.5s ease-in-out infinite",
        display:"flex", flexDirection:"column", alignItems:"center", gap:6,
        fontFamily:S.mono, fontSize:10, color:S.muted, letterSpacing:2 }}>
        <span>SCROLL</span>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
          <path d="M6 0v12M1 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [["4","Tipos de Agente"],["200ms","Tick Rate"],["30s","Ciclo de Marea"],["∞","Estados Posibles"]];
  return (
    <div style={{ background:"linear-gradient(135deg,#040f20,#071a30)",
      borderTop:`1px solid ${S.border}`, borderBottom:`1px solid ${S.border}`, padding:"40px" }}>
      <div style={{ maxWidth:1160, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
        {stats.map(([num,lbl],i) => (
          <div key={lbl} style={{ textAlign:"center", padding:24,
            borderRight: i<3 ? `1px solid ${S.border}` : "none" }}>
            <div style={{ fontSize:"3.2rem", fontWeight:800, letterSpacing:"-2px", lineHeight:1, marginBottom:8,
              background:`linear-gradient(135deg,${S.pearl},${S.foam})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{num}</div>
            <div style={{ fontFamily:S.mono, fontSize:10, color:S.muted, letterSpacing:2, textTransform:"uppercase" }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConceptCards() {
  const [hov, setHov] = useState(null);
  const cards = [
    { n:"01", icon:"🌊", t:"Ciclos de Marea", b:"Fase global HIGH/LOW cada 30s. Marea ALTA = movimiento rápido, corrientes fuertes, energía alta. Marea BAJA = lentitud, procesamiento interno, consolidación." },
    { n:"02", icon:"🤖", t:"Agentes Autónomos", b:"Cuatro tipos con estrategias únicas, presupuestos de energía propios. Cada uno adapta su comportamiento a la fase de marea en tiempo real." },
    { n:"03", icon:"🌀", t:"Corrientes de Información", b:"Las señales no viajan entre agentes directamente. Fluyen por corrientes direccionales. Agentes interceptan a ≤55px para leer o inyectar señales." },
    { n:"04", icon:"⚡", t:"Dinámica de Energía", b:"Cada movimiento consume energía. Señales la restauran. Predictores ganan bonos. Anchors acumulan pasivamente. La economía crea selección natural." },
  ];
  return (
    <section id="concepts" style={{ background:S.abyss, padding:"100px 40px" }}>
      <div style={{ maxWidth:1160, margin:"0 auto" }}>
        <Eyebrow>Sistema Central</Eyebrow>
        <h2 style={{ fontSize:"clamp(2.2rem,4vw,3.5rem)", fontWeight:800, lineHeight:1.05, letterSpacing:"-1px", marginBottom:20 }}>
          El Framework de<br/>Inteligencia Oceánica
        </h2>
        <p style={{ color:"rgba(224,247,255,0.55)", fontSize:"1.1rem", lineHeight:1.75, maxWidth:580, fontWeight:400, marginBottom:56 }}>
          TideNet modela comportamiento adaptativo complejo con metáforas oceánicas.
          La información fluye. Los agentes evolucionan. Los patrones emergen solos.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",
          gap:1, border:`1px solid ${S.border}`, background:S.border, borderRadius:8, overflow:"hidden" }}>
          {cards.map(({n,icon,t,b},i) => (
            <div key={n} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
              style={{ background: hov===i ? S.ocean : S.deep,
                padding:"36px 32px", position:"relative", overflow:"hidden", transition:"background 0.3s" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
                background:`linear-gradient(90deg,transparent,${S.foam},transparent)`,
                transform: hov===i ? "scaleX(1)" : "scaleX(0)", transition:"transform 0.4s" }} />
              <div style={{ fontFamily:S.mono, fontSize:11, color:S.muted, letterSpacing:2, marginBottom:20 }}>{n}</div>
              <div style={{ fontSize:"2rem", marginBottom:16 }}>{icon}</div>
              <div style={{ fontSize:"1.15rem", fontWeight:700, marginBottom:10 }}>{t}</div>
              <div style={{ color:"rgba(224,247,255,0.5)", fontSize:"0.88rem", lineHeight:1.65, fontWeight:400 }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentCards() {
  const [hov, setHov] = useState(null);
  const agents = [
    { emoji:"🏄", name:"Surfer",    color:"#00d4ff", tag:"tendencia · rápido · oportunista",
      desc:"Sigue las corrientes más fuertes. Busca señales de alta energía. Primero en llegar, primero en consumir." },
    { emoji:"🤿", name:"Diver",     color:"#8b5cf6", tag:"explorador · solitario · raro",
      desc:"Huye de zonas concurridas. Explora áreas dispersas con señales raras. Más lento pero descubre conocimiento único." },
    { emoji:"🔮", name:"Predictor", color:"#fbbf24", tag:"anticipador · estratégico · alto riesgo",
      desc:"Pronostica la próxima fase y se reposiciona antes del cambio. +12 pts de energía cuando el pronóstico es correcto." },
    { emoji:"⚓", name:"Anchor",    color:"#f87171", tag:"estable · acumulador · hub",
      desc:"Apenas se mueve. Acumula pasivamente todo lo que fluye cerca. Hub de conocimiento inamovible." },
  ];
  return (
    <section id="agents" style={{ background:S.ink, padding:"100px 40px" }}>
      <div style={{ maxWidth:1160, margin:"0 auto" }}>
        <Eyebrow>Tipos de Agente</Eyebrow>
        <h2 style={{ fontSize:"clamp(2.2rem,4vw,3.5rem)", fontWeight:800, lineHeight:1.05, letterSpacing:"-1px", marginBottom:20 }}>
          Cuatro Estrategias.<br/>Un Océano.
        </h2>
        <p style={{ color:"rgba(224,247,255,0.55)", fontSize:"1.1rem", lineHeight:1.75, maxWidth:580, fontWeight:400, marginBottom:56 }}>
          Cada arquetipo encarna una estrategia de supervivencia distinta. Su interacción
          produce inteligencia emergente que ningún agente individual podría lograr solo.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:16 }}>
          {agents.map(({emoji,name,color,tag,desc},i) => (
            <div key={name} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
              style={{ border:`1px solid ${hov===i ? color : S.border}`,
                borderRadius:8, padding:28, background:"rgba(255,255,255,0.025)",
                position:"relative", overflow:"hidden", transition:"transform 0.3s, border-color 0.3s",
                transform: hov===i ? "translateY(-4px)" : "none" }}>
              <div style={{ position:"absolute", inset:0, opacity: hov===i ? 1 : 0,
                background:`radial-gradient(circle at 50% 0%,${color}22,transparent 70%)`,
                transition:"opacity 0.3s", pointerEvents:"none" }} />
              <div style={{ width:44, height:44, borderRadius:"50%", background:`${color}22`,
                border:`2px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"1.2rem", marginBottom:18, boxShadow:`0 0 20px ${color}44`, position:"relative", zIndex:1 }}>{emoji}</div>
              <div style={{ fontSize:"1.1rem", fontWeight:800, marginBottom:6, color, position:"relative", zIndex:1 }}>{name}</div>
              <div style={{ fontFamily:S.mono, fontSize:10, letterSpacing:2, color:S.muted,
                textTransform:"uppercase", marginBottom:14, position:"relative", zIndex:1 }}>{tag}</div>
              <div style={{ fontSize:"0.85rem", color:"rgba(224,247,255,0.5)", lineHeight:1.6, position:"relative", zIndex:1 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n:"Paso 01 — Fase Global", t:"La Marea Cambia Cada 30s",
      b:"HIGH activa todo: velocidad alta, corrientes fuertes, alto consumo de energía. LOW ralentiza todo al 45%. Los agentes se adaptan en tiempo real sin coordinación central." },
    { n:"Paso 02 — Tick de Agente", t:"Agentes Ejecutan Estrategias Cada 200ms",
      b:"Cada tick cada agente evalúa su entorno y ejecuta su comportamiento. Surfers buscan corrientes. Divers huyen de multitudes. Predictores calculan timing. Anchors acumulan." },
    { n:"Paso 03 — Flujo de Corriente", t:"Corrientes Transportan Paquetes de Señal",
      b:"Corrientes se desplazan con fuerza y ángulo variables. Transportan señales flotantes. Agentes a ≤55px pueden leer o inyectar señales — comunicación indirecta emergente." },
    { n:"Paso 04 — Evolución", t:"Energía y Score Impulsan la Selección Natural",
      b:"+3pts por señal recogida, +12pts por predicción correcta, +1pt pasivo para Anchors. Los mejores agentes rankeados en vivo. La inteligencia emerge de la competencia." },
  ];
  return (
    <section id="how" style={{ background:S.abyss, padding:"100px 40px" }}>
      <div style={{ maxWidth:1160, margin:"0 auto" }}>
        <Eyebrow>Diseño del Sistema</Eyebrow>
        <h2 style={{ fontSize:"clamp(2.2rem,4vw,3.5rem)", fontWeight:800, lineHeight:1.05, letterSpacing:"-1px", marginBottom:20 }}>
          Cómo Funciona<br/>TideNet
        </h2>
        <p style={{ color:"rgba(224,247,255,0.55)", fontSize:"1.1rem", lineHeight:1.75, maxWidth:580, fontWeight:400, marginBottom:56 }}>
          Un loop continuo impulsado por la fase de marea, donde el conocimiento viaja por
          corrientes y los agentes compiten por acumular señales.
        </p>
        <div style={{ borderLeft:`1px solid ${S.border}`, paddingLeft:40 }}>
          {steps.map(({n,t,b},i) => (
            <div key={n} style={{ padding:"32px 0", position:"relative" }}>
              <div style={{ position:"absolute", left:-49, top:34, width:16, height:16,
                borderRadius:"50%", background:S.ink, border:`2px solid ${S.foam}` }}>
                <div style={{ position:"absolute", inset:2, borderRadius:"50%", background:S.foam,
                  animation:`blinkDot 2s ease-in-out ${i*0.5}s infinite` }} />
              </div>
              <div style={{ fontFamily:S.mono, fontSize:10, letterSpacing:2, color:S.foam, marginBottom:8, textTransform:"uppercase" }}>{n}</div>
              <div style={{ fontSize:"1.3rem", fontWeight:800, marginBottom:10, letterSpacing:"-0.3px" }}>{t}</div>
              <div style={{ color:"rgba(224,247,255,0.5)", fontSize:"0.9rem", lineHeight:1.7, maxWidth:600 }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta({ onSimClick }) {
  return (
    <section style={{ background:`linear-gradient(180deg,${S.ink} 0%,${S.abyss} 100%)`,
      borderTop:`1px solid ${S.border}`, padding:"100px 40px", textAlign:"center" }}>
      <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center" }}>
        <Eyebrow center>Plataforma Abierta</Eyebrow>
        <h2 style={{ fontSize:"clamp(2.2rem,4vw,3.5rem)", fontWeight:800, lineHeight:1.05, letterSpacing:"-1px", marginBottom:16 }}>
          Construye sobre TideNet
        </h2>
        <p style={{ color:"rgba(224,247,255,0.55)", fontSize:"1.1rem", lineHeight:1.75, maxWidth:560, fontWeight:400, marginBottom:40 }}>
          Base abierta para explorar inteligencia emergente, economías de agentes y sistemas
          de conocimiento distribuido. Fórkalo, extiéndelo, desplégalo.
        </p>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
          <BtnFoam onClick={onSimClick}>▶ INICIAR SIMULACIÓN</BtnFoam>
          <BtnGhost href="#concepts">LEER DOCS</BtnGhost>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 7. COMPONENTES — SIMULACIÓN
// ═══════════════════════════════════════════════════════════════════

function SimTopBar({ snap, playing, onTogglePlay, onReset, onSpeed }) {
  const phase = snap?.phase ?? "HIGH";
  const rem   = snap ? Math.ceil((30_000 - snap.phaseTimer) / 1000) : "—";
  return (
    <div style={{ height:52, background:"rgba(4,15,32,0.95)", borderBottom:`1px solid ${S.border}`,
      display:"flex", alignItems:"center", gap:12, padding:"0 20px", flexShrink:0, flexWrap:"wrap" }}>
      <span style={{ fontWeight:800, fontSize:"1rem", display:"flex", alignItems:"center", gap:8 }}>
        ⬡ TideNet
        <span style={{ fontFamily:S.mono, fontSize:10, letterSpacing:2, padding:"4px 10px", borderRadius:2,
          textTransform:"uppercase", transition:"all 0.5s",
          background: phase==="HIGH" ? "rgba(0,212,255,0.12)" : "rgba(10,25,60,0.6)",
          border: `1px solid ${phase==="HIGH" ? "rgba(0,212,255,0.4)" : "rgba(100,150,200,0.2)"}`,
          color: phase==="HIGH" ? S.foam : S.muted }}>
          {phase==="HIGH" ? "🌊 MAREA ALTA" : "🌑 MAREA BAJA"}
        </span>
      </span>
      <span style={{ fontFamily:S.mono, fontSize:11, color:S.muted }}>
        Próximo cambio: <strong style={{ color:S.pearl }}>{rem}s</strong>
      </span>
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
        <button onClick={onTogglePlay}
          style={{ fontFamily:S.mono, fontSize:11, fontWeight:500, letterSpacing:0.5,
            padding:"6px 14px", borderRadius:3, cursor:"pointer", transition:"all 0.15s",
            background: playing ? "rgba(0,212,255,0.14)" : "rgba(255,255,255,0.06)",
            border: playing ? "1px solid rgba(0,212,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: playing ? S.foam : S.pearl }}>
          {playing ? "⏸ PAUSAR" : "▶ PLAY"}
        </button>
        <button onClick={onReset}
          style={{ fontFamily:S.mono, fontSize:11, fontWeight:500, letterSpacing:0.5,
            padding:"6px 14px", borderRadius:3, cursor:"pointer",
            background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:S.pearl }}>
          ↺ RESET
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontFamily:S.mono, fontSize:11, color:S.muted }}>
          <span>VEL</span>
          <input type="range" min={1} max={6} defaultValue={2}
            onChange={e => onSpeed(e.target.value)}
            style={{ WebkitAppearance:"none", width:72, height:3,
              background:"rgba(255,255,255,0.12)", borderRadius:2, outline:"none", cursor:"pointer" }} />
        </div>
      </div>
    </div>
  );
}

function SimPanel({ snap, onToggleVis }) {
  const [vis, setVis] = useState({ surfer:true, diver:true, predictor:true, anchor:true });
  function toggle(type, checked) { setVis(p => ({...p,[type]:checked})); onToggleVis(type, checked); }
  const counts = snap?.counts ?? {};
  const top5   = snap?.top5 ?? [];
  const log    = snap?.log  ?? [];
  return (
    <div style={{ width:256, flexShrink:0, background:"rgba(4,12,24,0.9)", borderLeft:`1px solid ${S.border}`,
      overflowY:"auto", padding:10, display:"flex", flexDirection:"column", gap:8 }}>
      <PanelBlock label="Ciclo de Marea">
        <div style={{ height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden", marginBottom:6 }}>
          <div style={{ height:"100%", width:`${snap?.phasePct ?? 0}%`, borderRadius:2,
            background:"linear-gradient(90deg,#0e3a6e,#00d4ff)", transition:"width 0.3s" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontFamily:S.mono, fontSize:9, color:S.muted }}>
          <span>BAJA ◀</span>
          <span>{snap ? Math.ceil((30_000-snap.phaseTimer)/1000)+"s" : "—"}</span>
          <span>▶ ALTA</span>
        </div>
      </PanelBlock>

      <PanelBlock label="Filtros de Agente">
        {TYPE_META.map(({ type, color, label }) => (
          <label key={type} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 4px", borderRadius:4, cursor:"pointer", marginBottom:2 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:color, boxShadow:`0 0 5px ${color}`, display:"inline-block", flexShrink:0 }} />
            <span style={{ fontSize:12, flex:1, fontWeight:700, color }}>{label}</span>
            <span style={{ fontFamily:S.mono, fontSize:10, color:S.muted, background:"rgba(255,255,255,0.05)", padding:"1px 7px", borderRadius:10 }}>
              {counts[type] ?? 0}
            </span>
            <input type="checkbox" checked={vis[type]} onChange={e => toggle(type, e.target.checked)}
              style={{ accentColor:S.foam, width:12, height:12, cursor:"pointer" }} />
          </label>
        ))}
      </PanelBlock>

      <PanelBlock label="Métricas">
        {[
          ["Agentes Activos", snap ? Object.values(snap.counts).reduce((s,n)=>s+n,0) : null],
          ["Energía Promedio", snap?.avgEnergy],
          ["Señales en Flujo", snap?.sigTotal],
          ["Corrientes",       snap?.currCount],
          ["Tick #",           snap?.ticks],
        ].map(([k,v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11 }}>
            <span style={{ color:S.muted }}>{k}</span>
            <span style={{ fontFamily:S.mono, fontWeight:500, fontSize:12 }}>{v ?? "—"}</span>
          </div>
        ))}
      </PanelBlock>

      <PanelBlock label="Top Agentes">
        {top5.map((a,i) => (
          <div key={a.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 0",
            borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11 }}>
            <span style={{ fontFamily:S.mono, color:S.foam, width:18, fontSize:10 }}>#{i+1}</span>
            <span style={{ width:7, height:7, borderRadius:"50%", background:a.color, boxShadow:`0 0 4px ${a.color}`, display:"inline-block", flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.type} #{a.id}</div>
              <div style={{ height:2, borderRadius:1, marginTop:3, background:a.color, opacity:0.7, width:`${Math.min(100,a.energy)}%` }} />
            </div>
            <span style={{ fontFamily:S.mono, fontSize:10, color:S.muted }}>{a.score}</span>
          </div>
        ))}
      </PanelBlock>

      <PanelBlock label="Log de Eventos">
        <div style={{ maxHeight:110, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
          {log.map((e,i) => (
            <div key={i} style={{ fontFamily:S.mono, fontSize:10,
              color: i===0 ? "rgba(224,247,255,0.7)" : S.muted,
              padding:"2px 0", borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
              <em style={{ color:S.foam, fontStyle:"normal" }}>#{e.t}</em> {e.msg}
            </div>
          ))}
        </div>
      </PanelBlock>
    </div>
  );
}

function SimulationView({ onBack }) {
  const canvasRef = useRef(null);
  const { snap, playing, togglePlay, reset, setSpeed, toggleVis } = useSimulation(canvasRef);
  return (
    <div style={{ height:"100vh", paddingTop:60, display:"flex", flexDirection:"column", background:S.ink, overflow:"hidden" }}>
      <SimTopBar snap={snap} playing={playing} onTogglePlay={togglePlay} onReset={reset} onSpeed={setSpeed} />
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        <div style={{ flex:1, position:"relative" }}>
          <canvas ref={canvasRef} style={{ display:"block", width:"100%", height:"100%" }} />
          {!snap && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", background:"rgba(2,12,24,0.92)", gap:16 }}>
              <div style={{ width:48, height:48, borderRadius:"50%",
                border:"3px solid rgba(0,212,255,0.15)", borderTopColor:S.foam,
                animation:"spinRing 0.9s linear infinite" }} />
              <p style={{ fontFamily:S.mono, fontSize:12, color:S.muted, letterSpacing:2 }}>INICIALIZANDO TIDENET…</p>
            </div>
          )}
          <button onClick={onBack}
            style={{ position:"absolute", top:12, left:12, fontFamily:S.mono, fontSize:11,
              background:"rgba(4,15,32,0.85)", color:S.muted,
              border:`1px solid rgba(0,212,255,0.15)`, padding:"6px 14px",
              borderRadius:3, cursor:"pointer", backdropFilter:"blur(8px)", transition:"color 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.color=S.foam}
            onMouseLeave={e=>e.currentTarget.style.color=S.muted}>
            ← VOLVER
          </button>
        </div>
        <SimPanel snap={snap} onToggleVis={toggleVis} />
      </div>
    </div>
  );
}

const SimulationViewNoSSR = dynamic(() => Promise.resolve(SimulationView), { ssr: false });

// ═══════════════════════════════════════════════════════════════════
// 8. ESTILOS GLOBALES
// ═══════════════════════════════════════════════════════════════════
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #020c18; color: #e0f7ff; font-family: 'Syne', sans-serif;
    overflow-x: hidden; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #0e3a6e; border-radius: 2px; }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #00d4ff; cursor: pointer; }
  @keyframes pulseDot {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:0.35; transform:scale(0.55); } }
  @keyframes bob {
    0%,100% { transform:translateX(-50%) translateY(0); }
    50%      { transform:translateX(-50%) translateY(7px); } }
  @keyframes blinkDot {
    0%,100% { opacity:1; } 50% { opacity:0.15; } }
  @keyframes spinRing {
    to { transform:rotate(360deg); } }
`;

// ═══════════════════════════════════════════════════════════════════
// 9. PÁGINA RAÍZ — único export
// ═══════════════════════════════════════════════════════════════════
export default function TideNetApp() {
  const [view, setView] = useState("landing"); // "landing" | "simulation"
  const bgRef = useRef(null);
  useHeroBg(bgRef);

  return (
    <>
      <Head>
        <title>TideNet — La inteligencia fluye como el océano</title>
        <meta name="description" content="Simulación multi-agente donde agentes se comportan como mareas oceánicas." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌊</text></svg>" />
      </Head>

      {/* Estilos globales inline — sin dependencias externas */}
      <style>{GLOBAL_CSS}</style>

      {/* Navbar siempre visible */}
      <Nav onSimClick={() => setView(v => v === "simulation" ? "landing" : "simulation")} />

      {/* Rutas SPA sin next/router */}
      {view === "simulation" ? (
        <SimulationViewNoSSR onBack={() => setView("landing")} />
      ) : (
        <main>
          <Hero bgRef={bgRef} onSimClick={() => setView("simulation")} />
          <StatsBar />
          <ConceptCards />
          <AgentCards />
          <HowItWorks />
          <Cta onSimClick={() => setView("simulation")} />
        </main>
      )}
    </>
  );
}
