/* global __APP_VERSION__ */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { SENSOR_GROUPS, SENSOR_DB, MOUNT_DB } from "./data/index.js";

const APP_VERSION = __APP_VERSION__;

// ── Allied Vision design tokens ───────────────────────────────────────────────
const AV = {
  dark:        "#0D1820",   // header / nav background
  darkMid:     "#162232",   // slightly lighter dark
  orange:      "#E5520F",   // primary brand accent
  orangeHover: "#C94510",   // orange hover state
  orangeTint:  "rgba(229,82,15,0.07)",
  orangeTint2: "rgba(229,82,15,0.12)",
  bg:          "#EDF0F5",   // page background
  white:       "#FFFFFF",   // panel / card background
  border:      "#DDE2EA",   // default border
  borderLight: "#EEF1F5",   // inner dividers
  text:        "#1A2333",   // primary text
  text2:       "#4D5A6A",   // secondary text
  text3:       "#8D9BAD",   // muted / label text
  blue:        "#1a5fcc",   // image circle (retained UX color)
  greenOk:     "#1A8F4C",
  redWarn:     "#C0392B",
};

const sans = "'Inter', 'Noto Sans', Arial, sans-serif";
const mono = "'Noto Sans Mono', 'Courier New', monospace";

export default function SensorVisualizer() {
  const [selectedSensors, setSelectedSensors] = useState(new Set([
    "FF_ref", "shr_461", "hr100_927", "hr_455", "fxo_540", "fxo_547"
  ]));
  const [hoveredSensor, setHoveredSensor]   = useState(null);
  const [activeMount,   setActiveMount]     = useState(null);
  const [circlePos,     setCirclePos]       = useState(null);
  const [isDragging,    setIsDragging]      = useState(false);
  const dragOffset    = useRef({ dx: 0, dy: 0 });
  const svgRef        = useRef(null);
  const containerRef  = useRef(null);
  const [canvasW, setCanvasW] = useState(700);
  const [mountTab, setMountTab] = useState("MV");
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [windowW, setWindowW] = useState(window.innerWidth);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setCanvasW(containerRef.current.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setWindowW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const narrow = windowW < 840;

  const toggleSensor = (id) => {
    setSelectedSensors(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setCirclePos(null);
  };

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const activeSensors = useMemo(
    () => SENSOR_DB.filter(s => selectedSensors.has(s.id)).sort((a, b) => b.w * b.h - a.w * a.h),
    [selectedSensors]
  );

  // ── Layout math (multi-row) ───────────────────────────────────────────────────
  const n       = activeSensors.length;
  const PAD_X   = 28;
  const PAD_TOP = 28;
  const PAD_BOT = 52;
  const GAP     = 18;
  const ROW_GAP = 36;
  const MAX_ROW_H = 260;

  const availW  = canvasW - PAD_X * 2;
  const maxMmH  = n > 0 ? Math.max(...activeSensors.map(s => s.h)) : 1;
  const maxMmW  = n > 0 ? Math.max(...activeSensors.map(s => s.w)) : 1;
  const scale   = n > 0 ? Math.min(MAX_ROW_H / maxMmH, availW / maxMmW) : 1;

  const rows = [];
  let currentRow = [];
  let rowW = 0;
  activeSensors.forEach(s => {
    const pw = s.w * scale;
    const needed = currentRow.length > 0 ? rowW + GAP + pw : pw;
    if (currentRow.length > 0 && needed > availW) {
      rows.push(currentRow); currentRow = [s]; rowW = pw;
    } else {
      currentRow.push(s); rowW = needed;
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);

  const rects = [];
  let rowOriginY = PAD_TOP;
  rows.forEach(row => {
    const rowMaxH    = Math.max(...row.map(s => s.h * scale));
    const rowBaselineY = rowOriginY + rowMaxH;
    let cursor = PAD_X;
    row.forEach(s => {
      const pw = s.w * scale, ph = s.h * scale;
      const x  = cursor, y = rowBaselineY - ph;
      rects.push({ ...s, x, y, pw, ph, cx: x + pw / 2, cy: y + ph / 2, rowBaselineY });
      cursor += pw + GAP;
    });
    rowOriginY = rowBaselineY + ROW_GAP;
  });

  const totalContentH = rowOriginY - ROW_GAP;
  const canvasH       = totalContentH + PAD_BOT;

  // ── Image circle ─────────────────────────────────────────────────────────────
  const mountData  = activeMount ? MOUNT_DB.find(m => m.id === activeMount) : null;
  const circlePxR  = mountData ? (mountData.imageDiameter / 2) * scale : 0;

  const defaultCirclePos = rects.length > 0
    ? { x: rects[0].cx, y: rects[0].cy }
    : { x: canvasW / 2, y: canvasH / 2 };
  const effectiveCirclePos = circlePos || defaultCirclePos;

  // ── Drag handling ─────────────────────────────────────────────────────────────
  const getSVGPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    const src = e.touches ? e.touches[0] : e;
    pt.x = src.clientX; pt.y = src.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const onCircleMouseDown = useCallback((e) => {
    if (!mountData) return;
    e.preventDefault(); e.stopPropagation();
    const pt = getSVGPoint(e);
    dragOffset.current = { dx: pt.x - effectiveCirclePos.x, dy: pt.y - effectiveCirclePos.y };
    setIsDragging(true);
  }, [mountData, effectiveCirclePos, getSVGPoint]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      e.preventDefault();
      const pt = getSVGPoint(e);
      setCirclePos({ x: pt.x - dragOffset.current.dx, y: pt.y - dragOffset.current.dy });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onUp);
    };
  }, [isDragging, getSVGPoint]);

  useEffect(() => { setCirclePos(null); }, [activeMount]);

  // ── Scale bar ─────────────────────────────────────────────────────────────────
  const scaleMm = (() => {
    const candidates = [1, 2, 5, 10, 20, 50];
    return candidates.reduce((best, c) =>
      Math.abs(c * scale - 70) < Math.abs(best * scale - 70) ? c : best
    );
  })();

  // ── Vignetting analysis ───────────────────────────────────────────────────────
  const circleAnalysis = useMemo(() => {
    if (!mountData || rects.length === 0) return null;
    return rects.map(r => {
      const pos = circlePos || { x: r.cx, y: r.cy };
      const corners = [[r.x,r.y],[r.x+r.pw,r.y],[r.x,r.y+r.ph],[r.x+r.pw,r.y+r.ph]];
      const maxCornerDist = Math.max(...corners.map(([cx,cy]) =>
        Math.sqrt((cx - pos.x) ** 2 + (cy - pos.y) ** 2)
      ));
      const maxCornerDistMm = maxCornerDist / scale;
      const circleR = mountData.imageDiameter / 2;
      return { id: r.id, name: r.name, hasVignetting: maxCornerDistMm > circleR,
               maxCornerDistMm: maxCornerDistMm.toFixed(1), circleR };
    });
  }, [mountData, rects, circlePos, scale]);

  const canvasHfinal = Math.max(canvasH, 180);

  return (
    <div style={{ minHeight: "100vh", background: AV.bg, color: AV.text, fontFamily: sans, display: "flex", flexDirection: "column" }}>

      {/* ── Allied Vision Header ── */}
      <header style={{ background: AV.dark, borderBottom: `3px solid ${AV.orange}`, padding: "0 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          {/* Left: brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Camera icon */}
            <svg width={24} height={18} viewBox="0 0 24 18" fill="none" aria-hidden="true">
              <rect x={0.75} y={3.75} width={22.5} height={13.5} rx={1.5} stroke={AV.orange} strokeWidth={1.5}/>
              <circle cx={12} cy={10.5} r={4} stroke={AV.orange} strokeWidth={1.5}/>
              <rect x={8} y={0.75} width={8} height={3} rx={0.75} stroke={AV.orange} strokeWidth={1}/>
            </svg>
            <div>
              <div style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1 }}>
                Allied Vision
              </div>
              <div style={{ color: AV.orange, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>
                Optical Format Comparator
              </div>
            </div>
          </div>
          {/* Right: version + subtitle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9, color: "#4A6078", fontFamily: mono, letterSpacing: 0.5 }}>
              FXO · HR · SHR series
            </span>
            <span style={{ fontSize: 9, background: AV.darkMid, color: AV.text3, fontFamily: mono, padding: "2px 7px", borderRadius: 3, border: `1px solid #243548` }}>
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </header>

      {/* ── Page subtitle ── */}
      <div style={{ background: AV.darkMid, borderBottom: `1px solid #1E3048` }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "6px 20px" }}>
          <p style={{ margin: 0, fontSize: 10.5, color: "#4A6C8A", fontFamily: sans, letterSpacing: 0.2 }}>
            Select sensors to compare · overlay image circles · drag to check coverage
          </p>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, padding: narrow ? "14px 10px 28px" : "20px 16px 36px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", gap: 14, alignItems: "flex-start", flexDirection: narrow ? "column" : "row" }}>

          {/* ── LEFT: Sensor list ── */}
          <SidePanel title="Sensors" narrow={narrow}>
            <div style={{ padding: "7px 9px", borderBottom: `1px solid ${AV.borderLight}`, display: "flex", gap: 6 }}>
              {[
                ["All",  () => { setSelectedSensors(new Set(SENSOR_DB.map(s => s.id))); setCirclePos(null); }],
                ["None", () => { setSelectedSensors(new Set()); setCirclePos(null); }],
              ].map(([label, fn]) => (
                <MiniButton key={label} onClick={fn}>{label}</MiniButton>
              ))}
            </div>
            <div style={{ overflowY: "auto", maxHeight: narrow ? 320 : 620 }}>
              {SENSOR_GROUPS.map((group) => {
                const isCollapsed    = collapsedGroups.has(group.id);
                const selectedInGroup = group.sensors.filter(s => selectedSensors.has(s.id)).length;
                const isAVGroup      = group.id !== "reference";

                return (
                  <div key={group.id}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.id)}
                      style={{
                        width: "100%", background: "#F7F9FB",
                        border: "none", borderBottom: `1px solid ${AV.border}`,
                        borderLeft: `3px solid ${group.color}`,
                        padding: "7px 10px 7px 9px",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 7, textAlign: "left",
                      }}
                    >
                      <svg width={10} height={10} viewBox="0 0 10 10"
                        style={{ flexShrink: 0, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                        <polyline points="2,3.5 5,6.5 8,3.5" fill="none" stroke={group.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: group.color, fontFamily: mono, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {group.label}
                        </div>
                      </div>
                      {selectedInGroup > 0 && (
                        <div style={{ flexShrink: 0, background: group.color, color: "#fff", fontSize: 8, fontFamily: mono, fontWeight: 700, borderRadius: 9, padding: "1px 6px", minWidth: 16, textAlign: "center" }}>
                          {selectedInGroup}
                        </div>
                      )}
                    </button>

                    {/* Sensor rows */}
                    {!isCollapsed && group.sensors.map((s) => {
                      const isOn = selectedSensors.has(s.id);
                      const diag = Math.sqrt(s.w ** 2 + s.h ** 2).toFixed(1);
                      const maxW = 66.44, maxH = 44.30;
                      const tw = Math.max(4, Math.round((s.w / maxW) * 24));
                      const th = Math.max(2, Math.round((s.h / maxH) * 16));
                      return (
                        <button key={s.id} onClick={() => toggleSensor(s.id)}
                          style={{
                            width: "100%",
                            background: isOn ? AV.orangeTint : AV.white,
                            border: "none",
                            borderBottom: `1px solid ${AV.borderLight}`,
                            borderLeft: isOn ? `2px solid ${AV.orange}` : "2px solid transparent",
                            padding: "6px 11px 6px 13px",
                            cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 7, textAlign: "left",
                          }}
                        >
                          <Checkbox checked={isOn} color={isOn ? AV.orange : undefined} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: isOn ? 600 : 400, color: isOn ? AV.text : AV.text3, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {s.name}
                            </div>
                            <div style={{ fontSize: 7.5, color: isOn ? AV.text2 : AV.text3, fontFamily: mono, marginTop: 1 }}>
                              {s.w}×{s.h}mm · ⌀{diag}mm
                            </div>
                            {isAVGroup && (
                              <div style={{ fontSize: 7, color: isOn ? AV.text3 : "#C5CDD8", fontFamily: mono, marginTop: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {s.note}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0, width: 26, height: 18, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                            <div style={{
                              width: tw, height: th,
                              background: isOn ? group.color : "#D4D9E0",
                              opacity: isOn ? 0.4 : 1,
                              border: `1px solid ${isOn ? group.color : "#C0C8D2"}`,
                            }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </SidePanel>

          {/* ── CENTER: Canvas ── */}
          <div style={{ flex: "1 1 440px", minWidth: 0 }}>
            <div ref={containerRef}
              style={{ background: AV.white, border: `1px solid ${AV.border}`, borderRadius: 4, position: "relative", overflow: "hidden", userSelect: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <svg ref={svgRef} width={canvasW} height={canvasHfinal} style={{ display: "block", cursor: isDragging ? "grabbing" : "default" }}>
                <defs>
                  <pattern id="dots2" x={0} y={0} width={20} height={20} patternUnits="userSpaceOnUse">
                    <circle cx={10} cy={10} r={0.6} fill="#E4E8EE" />
                  </pattern>
                  {rects.map(r => (
                    <clipPath key={`clip-${r.id}`} id={`clip-${r.id}`}>
                      <rect x={r.x} y={r.y} width={r.pw} height={r.ph} />
                    </clipPath>
                  ))}
                </defs>
                <rect width={canvasW} height={canvasHfinal} fill="url(#dots2)" />

                {/* Baselines per row */}
                {n > 0 && rows.map((row, ri) => {
                  const rowRects = rects.filter(r => row.some(s => s.id === r.id));
                  const rowY = rowRects.reduce((acc, r) => Math.max(acc, r.y + r.ph), 0);
                  const x1   = Math.min(...rowRects.map(r => r.x)) - 10;
                  const x2   = Math.max(...rowRects.map(r => r.x + r.pw)) + 10;
                  return <line key={ri} x1={x1} y1={rowY} x2={x2} y2={rowY} stroke="#C8D0DA" strokeWidth={0.75} strokeDasharray="3 3" />;
                })}

                {/* ── Sensor rects ── */}
                {rects.map((r) => {
                  const isHov      = hoveredSensor === r.id;
                  const accentColor = r.groupColor || "#6B7A8D";
                  const fillColor   = isHov ? "#D8DDE4" : "#E0E5EB";
                  return (
                    <g key={r.id} style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredSensor(r.id)}
                      onMouseLeave={() => setHoveredSensor(null)}>
                      <rect x={r.x} y={r.y} width={r.pw} height={r.ph}
                        fill={fillColor} stroke={isHov ? accentColor : "#B4BDCA"} strokeWidth={isHov ? 1.5 : 1}
                        style={{ transition: "fill 0.1s" }} />
                      <line x1={r.x} y1={r.y} x2={r.x+r.pw} y2={r.y+r.ph} stroke="rgba(0,0,0,0.05)" strokeWidth={0.7} style={{ pointerEvents: "none" }} />
                      <line x1={r.x+r.pw} y1={r.y} x2={r.x} y2={r.y+r.ph} stroke="rgba(0,0,0,0.05)" strokeWidth={0.7} style={{ pointerEvents: "none" }} />
                      <circle cx={r.cx} cy={r.cy} r={1.5} fill={accentColor} opacity={0.3} style={{ pointerEvents: "none" }} />
                      {/* Group color top bar */}
                      <rect x={r.x} y={r.y} width={r.pw} height={Math.min(3, r.ph * 0.08)} fill={accentColor} opacity={0.55} style={{ pointerEvents: "none" }} />

                      {/* Vignetting overlay */}
                      {mountData && (() => {
                        const pos    = effectiveCirclePos;
                        const maskId = `vmask-${r.id}`;
                        return (
                          <g style={{ pointerEvents: "none" }}>
                            <defs>
                              <mask id={maskId}>
                                <rect x={r.x} y={r.y} width={r.pw} height={r.ph} fill="white" />
                                <circle cx={pos.x} cy={pos.y} r={circlePxR} fill="black" />
                              </mask>
                            </defs>
                            <rect x={r.x} y={r.y} width={r.pw} height={r.ph}
                              fill="rgba(160,30,30,0.28)" mask={`url(#${maskId})`} />
                          </g>
                        );
                      })()}

                      {/* Width dimension */}
                      {r.pw > 24 && (
                        <g style={{ pointerEvents: "none" }}>
                          <line x1={r.x} y1={r.y-10} x2={r.x} y2={r.y-5} stroke="#A8B3BE" strokeWidth={0.75} />
                          <line x1={r.x+r.pw} y1={r.y-10} x2={r.x+r.pw} y2={r.y-5} stroke="#A8B3BE" strokeWidth={0.75} />
                          <line x1={r.x+1} y1={r.y-7} x2={r.x+r.pw-1} y2={r.y-7} stroke="#A8B3BE" strokeWidth={0.75} />
                          {r.pw > 36 && <>
                            <rect x={r.x+r.pw/2-18} y={r.y-15} width={36} height={10} fill={AV.white} rx={1} />
                            <text x={r.x+r.pw/2} y={r.y-7} textAnchor="middle" fontSize={8} fill={AV.text2} fontFamily={mono} style={{ pointerEvents: "none" }}>{r.w}mm</text>
                          </>}
                        </g>
                      )}
                      {/* Format label inside */}
                      {r.pw > 38 && r.ph > 22 && (
                        <text x={r.cx} y={r.cy+4} textAnchor="middle"
                          fontSize={Math.max(7, Math.min(11, r.ph / 3.5))}
                          fill="rgba(0,0,0,0.18)" fontFamily={mono} fontWeight={500} style={{ pointerEvents: "none" }}>
                          {r.format}
                        </text>
                      )}
                      {/* Below-baseline labels */}
                      <text x={r.cx} y={r.rowBaselineY+14} textAnchor="middle" fontSize={8.5} fontWeight={600} fill={AV.text} fontFamily={sans} style={{ pointerEvents: "none" }}>
                        {r.name.split(" · ")[0]}
                      </text>
                      <text x={r.cx} y={r.rowBaselineY+25} textAnchor="middle" fontSize={7.5} fill={AV.text3} fontFamily={mono} style={{ pointerEvents: "none" }}>
                        {r.w}×{r.h}
                      </text>
                    </g>
                  );
                })}

                {/* ── Image circle ── */}
                {mountData && rects.length > 0 && (() => {
                  const pos = effectiveCirclePos;
                  return (
                    <g>
                      <circle cx={pos.x} cy={pos.y} r={circlePxR}
                        fill="rgba(30,100,200,0.04)"
                        stroke={AV.blue} strokeWidth={1.5} strokeDasharray="5 3"
                        style={{ cursor: isDragging ? "grabbing" : "grab", pointerEvents: "all" }}
                        onMouseDown={onCircleMouseDown}
                        onTouchStart={onCircleMouseDown}
                      />
                      <line x1={pos.x-8} y1={pos.y} x2={pos.x+8} y2={pos.y} stroke={AV.blue} strokeWidth={1} opacity={0.6} style={{ pointerEvents: "none" }} />
                      <line x1={pos.x} y1={pos.y-8} x2={pos.x} y2={pos.y+8} stroke={AV.blue} strokeWidth={1} opacity={0.6} style={{ pointerEvents: "none" }} />
                      <circle cx={pos.x} cy={pos.y} r={2} fill={AV.blue} opacity={0.7} style={{ pointerEvents: "none" }} />
                      <rect x={pos.x-24} y={pos.y-circlePxR-16} width={48} height={13} fill="rgba(255,255,255,0.92)" rx={2} style={{ pointerEvents: "none" }} />
                      <text x={pos.x} y={pos.y-circlePxR-5}
                        textAnchor="middle" fontSize={8.5} fill={AV.blue} fontFamily={mono} fontWeight={600}
                        style={{ pointerEvents: "none" }}>
                        ⌀{mountData.imageDiameter}mm
                      </text>
                      {!isDragging && (
                        <text x={pos.x} y={pos.y+circlePxR+13}
                          textAnchor="middle" fontSize={8} fill={AV.blue} fontFamily={mono} opacity={0.55}
                          style={{ pointerEvents: "none" }}>
                          drag
                        </text>
                      )}
                    </g>
                  );
                })()}

                {/* Scale bar */}
                {n > 0 && (
                  <g style={{ pointerEvents: "none" }}>
                    <line x1={PAD_X} y1={canvasHfinal-13} x2={PAD_X+scaleMm*scale} y2={canvasHfinal-13} stroke="#A8B3BE" strokeWidth={1.5} />
                    <line x1={PAD_X} y1={canvasHfinal-16} x2={PAD_X} y2={canvasHfinal-10} stroke="#A8B3BE" strokeWidth={1} />
                    <line x1={PAD_X+scaleMm*scale} y1={canvasHfinal-16} x2={PAD_X+scaleMm*scale} y2={canvasHfinal-10} stroke="#A8B3BE" strokeWidth={1} />
                    <text x={PAD_X+scaleMm*scale+6} y={canvasHfinal-9} fontSize={8} fill="#A8B3BE" fontFamily={mono}>{scaleMm} mm</text>
                  </g>
                )}

                {n === 0 && (
                  <text x={canvasW/2} y={90} textAnchor="middle" fontSize={11} fill="#C8D0DA" letterSpacing={2} fontFamily={sans}>
                    SELECT SENSORS TO COMPARE
                  </text>
                )}
              </svg>

              {/* Sensor hover tooltip */}
              {hoveredSensor && (() => {
                const r = rects.find(x => x.id === hoveredSensor);
                if (!r) return null;
                const diag = Math.sqrt(r.w ** 2 + r.h ** 2).toFixed(2);
                return (
                  <div style={{ position: "absolute", top: 8, right: 8, background: AV.white, border: `1px solid ${AV.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "10px 14px", borderRadius: 4, fontSize: 11, lineHeight: 1.9, color: AV.text2, minWidth: 190, pointerEvents: "none", fontFamily: mono, borderTop: `3px solid ${AV.orange}` }}>
                    <div style={{ fontWeight: 700, color: AV.text, marginBottom: 4, fontSize: 11, fontFamily: sans }}>{r.name}</div>
                    {r.note && <div style={{ fontSize: 8.5, color: AV.text3, marginBottom: 6, lineHeight: 1.5, fontFamily: sans }}>{r.note}</div>}
                    <Row k="W"        v={`${r.w} mm`} />
                    <Row k="H"        v={`${r.h} mm`} />
                    <Row k="Diagonal" v={`${diag} mm`} />
                    <Row k="Area"     v={`${(r.w * r.h).toFixed(1)} mm²`} />
                    <Row k="MP"       v={`${r.mp} MP`} />
                    <Row k="Format"   v={r.format} />
                  </div>
                );
              })()}
            </div>

            {/* Info bar */}
            <div style={{ marginTop: 7, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "2px 8px", fontSize: 10, color: AV.text3, fontFamily: mono }}>
              <span>{n} sensor{n !== 1 ? "s" : ""} selected{mountData ? ` · ${mountData.name} (⌀${mountData.imageDiameter}mm)` : ""}</span>
              {n > 1 && (() => {
                const lg = activeSensors[0], sm = activeSensors[activeSensors.length - 1];
                return <span>{lg.w.toFixed(1)}×{lg.h.toFixed(1)} / {sm.w.toFixed(1)}×{sm.h.toFixed(1)}: {(lg.w * lg.h / (sm.w * sm.h)).toFixed(1)}× area</span>;
              })()}
            </div>

            {/* Vignetting analysis */}
            {circleAnalysis && (
              <div style={{ marginTop: 10, background: AV.white, border: `1px solid ${AV.border}`, borderRadius: 4, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "8px 14px", borderBottom: `1px solid ${AV.borderLight}`, background: "#F7F9FB", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: AV.orange, borderRadius: 2 }} />
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: AV.text2, fontFamily: sans }}>
                    Coverage Analysis · {mountData.name}
                  </span>
                </div>
                {circleAnalysis.map(v => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: `1px solid ${AV.borderLight}`, fontSize: 10, fontFamily: mono }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.hasVignetting ? AV.redWarn : AV.greenOk, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: AV.text, fontWeight: 500 }}>{v.name}</span>
                    {v.hasVignetting
                      ? <span style={{ color: AV.redWarn }}>Corner outside by {(v.maxCornerDistMm - v.circleR).toFixed(1)}mm</span>
                      : <span style={{ color: AV.greenOk }}>Fully covered ✓</span>
                    }
                    <span style={{ color: AV.text3, fontSize: 9 }}>max ⌀{(v.maxCornerDistMm * 2)}mm</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Mount list ── */}
          <SidePanel title="Image Circles / Mounts" narrow={narrow}>
            <div style={{ display: "flex", borderBottom: `1px solid ${AV.border}` }}>
              {[["MV", "Machine Vision"], ["Photo", "Photo"]].map(([val, label]) => (
                <button key={val} onClick={() => setMountTab(val)} style={{
                  flex: 1, padding: "8px 0", border: "none",
                  background: AV.white,
                  borderBottom: mountTab === val ? `2px solid ${AV.orange}` : "2px solid transparent",
                  fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
                  color: mountTab === val ? AV.orange : AV.text3,
                  fontWeight: mountTab === val ? 600 : 400,
                  cursor: "pointer", fontFamily: sans,
                  transition: "color 0.15s",
                }}>{label}</button>
              ))}
            </div>
            <div style={{ padding: "6px 9px", borderBottom: `1px solid ${AV.borderLight}` }}>
              <MiniButton onClick={() => { setActiveMount(null); setCirclePos(null); }}>Clear circle</MiniButton>
            </div>
            <div style={{ overflowY: "auto", maxHeight: narrow ? 260 : 570 }}>
              {MOUNT_DB.filter(m => m.type === mountTab).map((m) => {
                const isOn   = activeMount === m.id;
                const maxD   = Math.max(...MOUNT_DB.filter(x => x.type === mountTab).map(x => x.imageDiameter));
                const thumbR = Math.max(3, Math.round((m.imageDiameter / maxD) * 12));
                return (
                  <button key={m.id}
                    onClick={() => { setActiveMount(isOn ? null : m.id); setCirclePos(null); }}
                    style={{
                      width: "100%",
                      background: isOn ? AV.orangeTint : AV.white,
                      border: "none",
                      borderBottom: `1px solid ${AV.borderLight}`,
                      borderLeft: isOn ? `2px solid ${AV.orange}` : "2px solid transparent",
                      padding: "8px 11px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 9, textAlign: "left",
                      transition: "background 0.1s",
                    }}>
                    <div style={{ flexShrink: 0, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{
                        width: thumbR * 2, height: thumbR * 2, borderRadius: "50%",
                        border: `1.5px ${isOn ? "solid" : "dashed"} ${isOn ? AV.blue : "#B4BDCA"}`,
                        background: isOn ? "rgba(26,95,204,0.08)" : "transparent",
                        transition: "all 0.1s",
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: isOn ? 600 : 400, color: isOn ? AV.blue : AV.text, fontFamily: sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                      <div style={{ fontSize: 8, color: isOn ? "#5580cc" : AV.text3, fontFamily: mono, marginTop: 1 }}>⌀{m.imageDiameter}mm</div>
                      <div style={{ fontSize: 7.5, color: "#C5CDD8", fontFamily: mono, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.notes}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </SidePanel>

        </div>

        {/* ── Legend + disclaimer ── */}
        <div style={{ maxWidth: 1240, margin: "14px auto 0", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {SENSOR_GROUPS.filter(g => g.id !== "reference").map(g => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, background: g.color, opacity: 0.55, borderRadius: 1, border: `1px solid ${g.color}` }} />
              <span style={{ fontSize: 9, color: AV.text3, fontFamily: mono, letterSpacing: 0.5 }}>{g.id.toUpperCase()}</span>
            </div>
          ))}
          <span style={{ fontSize: 9, color: "#B4BDCA", fontFamily: mono, letterSpacing: 0.8, marginLeft: "auto" }}>
            Dimensions are nominal · for reference only · red = outside image circle
          </span>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: AV.dark, borderTop: `1px solid #1E3048`, padding: "10px 20px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontSize: 9, color: "#3A5268", fontFamily: sans }}>
            © Allied Vision Technologies GmbH · Optical Format Comparator
          </span>
          <span style={{ fontSize: 9, color: "#3A5268", fontFamily: mono }}>
            v{APP_VERSION}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ── Small shared components ────────────────────────────────────────────────────

function SidePanel({ title, children, narrow = false }) {
  return (
    <div style={{
      flex: narrow ? "1 1 100%" : "0 0 210px",
      background: AV.white,
      border: `1px solid ${AV.border}`,
      borderRadius: 4,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        padding: "8px 12px 7px",
        borderBottom: `1px solid ${AV.border}`,
        borderLeft: `3px solid ${AV.orange}`,
        background: "#F7F9FB",
        fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
        color: AV.text2, fontFamily: sans, fontWeight: 600,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MiniButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: AV.white,
      border: `1px solid ${AV.border}`,
      color: AV.text2,
      fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 3, cursor: "pointer",
      fontFamily: sans, fontWeight: 500,
      transition: "border-color 0.15s, color 0.15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = AV.orange; e.currentTarget.style.color = AV.orange; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = AV.border; e.currentTarget.style.color = AV.text2; }}
    >{children}</button>
  );
}

function Checkbox({ checked, color = AV.orange }) {
  return (
    <div style={{
      width: 13, height: 13, flexShrink: 0, borderRadius: 2,
      border: `1.5px solid ${checked ? color : "#C0C8D4"}`,
      background: checked ? color : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.1s",
    }}>
      {checked && (
        <svg width={7} height={6} viewBox="0 0 7 6">
          <polyline points="1,3 3,5 6,1" fill="none" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: AV.text3 }}>{k}</span>
      <span style={{ color: AV.text }}>{v}</span>
    </div>
  );
}
