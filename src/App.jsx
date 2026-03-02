import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// Load Noto Sans from Google Fonts
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500;600;700&display=swap";
document.head.appendChild(fontLink);

// ─── Sensor Groups ─────────────────────────────────────────────────────────────
// Each group has an id, label, color accent, and array of sensors.
// Allied Vision sensors use actual physical dimensions derived from sensor specs.
// Sony Pregius S physical sizes: pixel_size × resolution pixels
//   IMX547: 2.74µm × 2448×2048 → 6.71×5.61mm → 1/1.8"
//   IMX546: 2.74µm × 2840×2840 → 7.78×7.78mm → 2/3"
//   IMX545: 2.74µm × 4096×3000 → 11.22×8.22mm → 1/1.1"
//   IMX542: 2.74µm × 5320×3032 → 14.58×8.31mm → 1"
//   IMX541: 2.74µm × 4512×4512 → 12.36×12.36mm → 1" (sq)
//   IMX540: 2.74µm × 5328×4608 → 14.60×12.63mm → 1.2"
//   IMX535: 2.74µm × 4096×3008 → 11.22×8.24mm (same as 545, slightly diff res)
//   IMX487 (UV): 2.74µm × 2840×2840 → 7.78×7.78mm → 2/3"
//   IMX455: 3.76µm × 9568×6380 → 35.98×23.99mm → 35mm FF
//   IMX461: 3.76µm × 11664×8750 → 43.86×32.90mm → medium format (44×33mm)
//   IMX411: 3.76µm × 14208×10656 → 53.42×40.07mm → 53×40mm
//   IMX661: 3.45µm × 13392×9528 → 46.20×32.87mm → 3.6" type
//   IMX342: 3.45µm × 6480×4860 → 22.36×16.77mm → APS-C
//   IMX252: 3.45µm × 2048×1536 → 7.07×5.30mm → 2/3"
//   For HR legacy CCD sensors:
//   NOIP1SE025KA (ON Semi 25MP): 25MP, ~2/3" → approx same as Sony 2/3"
//   Canon 120MXSC: ~120MP, 30×20mm
//   ON Semi PYTHON 25K: 25MP, 23×23mm

const SENSOR_GROUPS = [
  {
    id: "reference",
    label: "Reference Formats",
    color: "#555",
    sensors: [
      { id: "MF_ref",    name: "Medium Format",   format: "GFX",       w: 43.8,  h: 32.9,  mp: 100, note: "GFX / IMX461 class" },
      { id: "FF_ref",    name: "Full Frame 35mm",  format: "35mm",      w: 36.0,  h: 24.0,  mp: 61,  note: "IMX455 class" },
      { id: "APS-C",     name: "APS-C",           format: "APS-C",     w: 23.5,  h: 15.6,  mp: 24,  note: "Typical Nikon APS-C" },
      { id: "ind_4_3",   name: '4/3" Industrial', format: '4/3"',      w: 17.6,  h: 13.2,  mp: 16,  note: "Type 4/3\"" },
      { id: "1_0",       name: '1"',              format: '1"',        w: 12.8,  h: 9.6,   mp: 9,   note: "Type 1\"" },
      { id: "2_3_ref",   name: '2/3"',            format: '2/3"',      w: 8.8,   h: 6.6,   mp: 5,   note: "Type 2/3\"" },
      { id: "1_1.8_ref", name: '1/1.8"',          format: '1/1.8"',    w: 7.18,  h: 5.32,  mp: 5,   note: "Type 1/1.8\"" },
      { id: "1_2_ref",   name: '1/2"',            format: '1/2"',      w: 6.4,   h: 4.8,   mp: 3,   note: "Type 1/2\"" },
    ]
  },
  {
    id: "fxo",
    label: "FXO Series (Allied Vision / SVS-Vistek)",
    color: "#1a5fcc",
    sensors: [
      // ── Sony Pregius S 4th gen (2.74µm BSI) ──────────────────────────────
      // IMX530/540: 5328×4608 → 14.60×12.63mm (Type 1.2", shared sensor die)
      { id: "fxo_540",  name: "FXO 540/530 · 24.5MP", format: '1.2"',   w: 14.60, h: 12.63, mp: 24.5, note: "IMX540/530 · C-mount · 10GigE/25GigE/CXP-12" },
      // IMX532/542: 5328×3040 → 14.60×8.33mm (Type 1")
      { id: "fxo_542",  name: "FXO 542/532 · 16.1MP", format: '1"',     w: 14.60, h:  8.33, mp: 16.1, note: "IMX542/532 · C-mount · 10GigE/25GigE/CXP-12" },
      // IMX531/541: 4512×4512 → 12.36×12.36mm (Type 1.1" square)
      { id: "fxo_541",  name: "FXO 541/531 · 20.4MP", format: '1.1"sq', w: 12.36, h: 12.36, mp: 20.4, note: "IMX541/531 · C-mount · square sensor" },
      // IMX535/545: 4128×3008 × 2.74µm → 11.31×8.24mm (Type 1.1")
      { id: "fxo_545",  name: "FXO 545/535 · 12.2MP", format: '1.1"',   w: 11.31, h:  8.24, mp: 12.2, note: "IMX545/535 · C-mount · 10GigE/25GigE/CXP-12" },
      // IMX546: 2856×2848 × 2.74µm → 7.83×7.80mm (Type 2/3", near-square)
      { id: "fxo_546",  name: "FXO 546 · 8.1MP",      format: '2/3"sq', w:  7.83, h:  7.80, mp:  8.1, note: "IMX546 · C-mount · square sensor · CXP-12" },
      // IMX487 (UV): 2856×2848 × 2.74µm → 7.83×7.80mm (same die as IMX546)
      { id: "fxo_487",  name: "FXO 487 · 8.1MP UV",   format: '2/3"',   w:  7.83, h:  7.80, mp:  8.1, note: "IMX487 · UV 200-400nm · 10GigE/CXP-12" },
      // IMX547: 2472×2064 × 2.74µm → 6.77×5.66mm (Type 1/1.8")
      { id: "fxo_547",  name: "FXO 547 · 5.1MP",      format: '1/1.8"', w:  6.77, h:  5.66, mp:  5.1, note: "IMX547 · C-mount · 10GigE/CXP-12" },
      // ── Sony Pregius S 3rd gen (4.5µm) ───────────────────────────────────
      // IMX420: 3216×2208 → 14.47×9.94mm (Type ~1", 4.5µm pixel)
      { id: "fxo_420",  name: "FXO 420 · 7.1MP",      format: '~1"',    w: 14.47, h:  9.94, mp:  7.1, note: "IMX420 · 3rd gen · 4.5µm · CXP-12 (2x)" },
      // IMX421: 4512×4512 square → 20.3×20.3mm but 4.5µm → same die as 420 era? Actually IMX421 = 4096×2160, 4.5µm → 18.43×9.72mm
      // Based on FXO naming convention and 3rd gen lineup, IMX421 = 4096×2160 = 8.9MP
      { id: "fxo_421",  name: "FXO 421 · 2.8MP",      format: '2/3"',   w:  8.75, h:  6.62, mp:  2.8, note: "IMX421 · 3rd gen · 4.5µm · CXP-12 (2x)" },
      // IMX425: 1600×1104 → 7.20×4.97mm (4.5µm pixel, Type ~1/2")
      { id: "fxo_425",  name: "FXO 425 · 1.8MP",      format: '~1/2"',  w:  7.20, h:  4.97, mp:  1.8, note: "IMX425 · 3rd gen · 4.5µm · 671fps · CXP-12 (2x)" },
      // ── SWIR ─────────────────────────────────────────────────────────────
      // IMX992: 2560×2048 → 8.83×7.07mm (3.45µm pixel, Type 1/1.1" SWIR)
      { id: "fxo_992",  name: "FXO 992 · 5.2MP SWIR", format: '1/1.1"', w:  8.83, h:  7.07, mp:  5.2, note: "IMX992 · SWIR 400-1700nm · 3.45µm · 10GigE-T" },
      // ── Sony Pregius S 5th gen (2.74µm BSI stacked) — FXO 100GigE ────────
      // IMX925: 5312×4608 × 2.74µm = 14.56×12.63mm (Type 1.2", 19.3mm diag) — confirmed via fxo925M100GE
      { id: "fxo_925",  name: "FXO 925 · 24.5MP",    format: '1.2"',   w: 14.56, h: 12.63, mp: 24.5, note: "IMX925 · 5th gen · 2.74µm · 442fps · C-mount · 100GigE" },
      // IMX935: same die as IMX925, lower-power variant — identical sensor size
      { id: "fxo_935",  name: "FXO 935 · 24.5MP",    format: '1.2"',   w: 14.56, h: 12.63, mp: 24.5, note: "IMX935 · 5th gen · 2.74µm · low-power · C-mount · 100GigE" },
      // IMX926: 4096×3040 × 2.74µm = 11.22×8.33mm (Type 1/1.1", 14.0mm diag) — up to 661fps
      { id: "fxo_926",  name: "FXO 926 · 12.4MP",    format: '1/1.1"', w: 11.22, h:  8.33, mp: 12.4, note: "IMX926 · 5th gen · 2.74µm · 661fps · C-mount · 100GigE" },
      // IMX936: same die as IMX926, lower-power variant — identical sensor size
      { id: "fxo_936",  name: "FXO 936 · 12.4MP",    format: '1/1.1"', w: 11.22, h:  8.33, mp: 12.4, note: "IMX936 · 5th gen · 2.74µm · low-power · C-mount · 100GigE" },
    ]
  },
  {
    id: "hr",
    label: "HR Series (Allied Vision / SVS-Vistek)",
    color: "#16a085",
    sensors: [
      // ── HR 10GigE / CXP: M58 mount ───────────────────────────────────────
      { id: "hr_455",    name: "HR 455 · 61MP",         format: "35mm FF",   w: 35.98, h: 23.99, mp: 61,    note: "IMX455 · M58 · 10GigE/CXP · rolling · TEC opt." },
      { id: "hr_342",    name: "HR 342 · 22.3MP",        format: "APS-C",     w: 22.37, h: 16.77, mp: 22.3,  note: "IMX342 · M58 · global shutter · 3.45µm" },
      // IMX183: 5496×3672 × 2.4µm → 13.19×8.81mm (Type 1")
      { id: "hr_183",    name: "HR 183 · 20MP",          format: '1"',        w: 13.19, h:  8.81, mp: 20,    note: "IMX183 · M58 · rolling · 2.4µm" },
      // IMX304: 4112×3008 × 3.45µm → 14.19×10.38mm (Type 1.1")
      { id: "hr_304",    name: "HR 304 · 12.4MP",        format: '1.1"',      w: 14.19, h: 10.38, mp: 12.4,  note: "IMX304 · M58 · global shutter · 3.45µm" },
      // IMX253: 4112×3008 × 3.45µm → 14.19×10.38mm (Type 1.1" — not 2/3"!)
      { id: "hr_253",    name: "HR 253 · 5MP",           format: '1.1"',      w: 14.19, h: 10.38, mp:  5,    note: "IMX253 · M58 · global shutter · 3.45µm" },
      // IMX265: 2064×1544 × 3.45µm → 7.12×5.33mm (Type 1/1.8" — not 2/3"!)
      { id: "hr_265",    name: "HR 265 · 3.2MP",         format: '1/1.8"',    w:  7.12, h:  5.33, mp:  3.2,  note: "IMX265 · M58 · global shutter · 3.45µm" },
      // ── HR 100GigE: M52/M58/RF mount, IMX927 series ──────────────────────
      // Sony IMX927 series — 5th gen Pregius S, 2.74µm BSI, SLVS-EC → 100GigE/CXPoF
      // Physical size = pixel pitch × pixel count
      // IMX927: 10272×10272 × 2.74µm = 28.15×28.15mm (Type 2.5", diag 39.7mm)
      { id: "hr100_927", name: "HR 927 · 105MP",          format: 'Type 2.5"', w: 28.15, h: 28.15, mp: 105.5, note: "IMX927 · 2.74µm · global sh. · 100fps · M52/M58/RF" },
      // IMX928: 8256×8256 × 2.74µm = 22.62×22.62mm (Type 2.0", diag 31.9mm)
      { id: "hr100_928", name: "HR 928 · 68MP",           format: 'Type 2.0"', w: 22.62, h: 22.62, mp: 68.2,  note: "IMX928 · 2.74µm · global sh. · 126fps · M52/M58/RF" },
      // IMX929: 8224×6176 × 2.74µm = 22.53×16.92mm (Type 1.8", diag 28.1mm)
      { id: "hr100_929", name: "HR 929 · 51MP",           format: 'Type 1.8"', w: 22.53, h: 16.92, mp: 50.8,  note: "IMX929 · 2.74µm · global sh. · 201fps · M52/M58/RF" },
      // IMX947: 5136×5136 × 5.48µm = 28.14×28.14mm (Type 2.5", larger pixel, higher sensitivity)
      { id: "hr100_947", name: "HR 947 · 26MP",           format: 'Type 2.5"', w: 28.14, h: 28.14, mp: 26.4,  note: "IMX947 · 5.48µm · global sh. · 383fps · M52/M58/RF" },
      // IMX949: 4112×3088 × 5.48µm = 22.53×16.92mm (Type 1.8", larger pixel)
      { id: "hr100_949", name: "HR 949 · 13MP",           format: 'Type 1.8"', w: 22.53, h: 16.92, mp: 12.7,  note: "IMX949 · 5.48µm · global sh. · 722fps · M52/M58/RF" },
    ]
  },
  {
    id: "shr",
    label: "SHR Series (Allied Vision / SVS-Vistek)",
    color: "#8e44ad",
    sensors: [
      // SHR cameras: M72 mount, very large sensors (medium format and above)
      // IMX811: 19200×12800 × 2.81µm → 53.95×35.97mm (Type 4.1")
      { id: "shr_811",  name: "SHR 811 · 245MP",  format: '4.1"',      w: 53.95, h: 35.97, mp: 245,  note: "IMX811 · M72 · 19200×12800 · 2.81µm" },
      // IMX411: 14192×10640 × 3.76µm → 53.36×40.01mm (Type 4.2")
      { id: "shr_411",  name: "SHR 411 · 151MP",  format: '4.2"',      w: 53.36, h: 40.01, mp: 151,  note: "IMX411 · M72 · 14192×10640 · rolling" },
      // IMX661: 13400×9528 × 3.45µm → 46.23×32.87mm (Type 3.6")
      { id: "shr_661",  name: "SHR 661 · 128MP",  format: '3.6"',      w: 46.23, h: 32.87, mp: 128,  note: "IMX661 · M72 · 13400×9528 · global sh." },
      // IMX461: 11656×8742 × 3.76µm → 43.83×32.87mm (Type 3.4")
      { id: "shr_461",  name: "SHR 461 · 102MP",  format: '3.4"',      w: 43.83, h: 32.87, mp: 102,  note: "IMX461 · M72 · 11656×8742 · rolling" },
    ]
  },
];

// Flat sensor DB for lookups (derived from groups)
const SENSOR_DB = SENSOR_GROUPS.flatMap(g => g.sensors.map(s => ({ ...s, groupId: g.id, groupColor: g.color })));

// ─── Mount / Image Circle Database ────────────────────────────────────────────
const MOUNT_DB = [
  { id: "C",      name: "C-Mount",         type: "MV",    imageDiameter: 18.0,  notes: "Max ⌀18mm · most common industrial mount" },
  { id: "CS",     name: "CS-Mount",        type: "MV",    imageDiameter: 18.0,  notes: "Like C, but 5mm shorter flange" },
  { id: "S",      name: "S-Mount (M12)",   type: "MV",    imageDiameter: 8.0,   notes: "⌀8–10mm · board-level cameras" },
  { id: "TFL",    name: "TFL-Mount (M35)", type: "MV",    imageDiameter: 22.0,  notes: "⌀22mm · targets 4/3\" sensor" },
  { id: "M42",    name: "M42×1",           type: "MV",    imageDiameter: 28.8,  notes: "⌀28.8mm · industrial & legacy" },
  { id: "M58",    name: "M58×0.75",        type: "MV",    imageDiameter: 48.0,  notes: "⌀48mm · HR series mount" },
  { id: "M52",    name: "M52×0.75",        type: "MV",    imageDiameter: 41.0,  notes: "⌀41mm · HR 100GigE flat-front opt." },
  { id: "M72",    name: "M72×0.75",        type: "MV",    imageDiameter: 62.0,  notes: "⌀62mm · SHR series mount" },
  { id: "M90",    name: "M90×1",           type: "MV",    imageDiameter: 80.0,  notes: "⌀80mm · large-format inspection" },
  { id: "F47",    name: "F-Mount (⌀43)",   type: "MV",    imageDiameter: 43.3,  notes: "Nikon F · HR adapter option" },
  { id: "EF44",   name: "EF-Mount (⌀44)",  type: "MV",    imageDiameter: 44.0,  notes: "Canon EF · HR/FXO adapter option" },
  // Photo mounts
  { id: "LF",     name: "Large Format",    type: "Photo", imageDiameter: 60.0,  notes: "4×5\" field cameras" },
  { id: "GFX_m",  name: "GFX Mount",       type: "Photo", imageDiameter: 55.0,  notes: "Fujifilm GFX · medium format" },
  { id: "RF",     name: "RF Mount",        type: "Photo", imageDiameter: 44.0,  notes: "Canon RF · full frame" },
  { id: "ZMount", name: "Z Mount",         type: "Photo", imageDiameter: 44.0,  notes: "Nikon Z · full frame" },
  { id: "EMount", name: "E-Mount",         type: "Photo", imageDiameter: 43.1,  notes: "Sony E · full frame / APS-C" },
  { id: "Fmount", name: "F-Mount",         type: "Photo", imageDiameter: 43.3,  notes: "Nikon F · full frame" },
  { id: "MFT_m",  name: "MFT Mount",       type: "Photo", imageDiameter: 21.6,  notes: "Micro Four Thirds" },
];

const mono = "'Noto Sans Mono', 'Courier New', monospace";
const sans = "'Noto Sans', Arial, sans-serif";

export default function SensorVisualizer() {
  // Default: show one representative from each AV series + Full Frame reference
  const [selectedSensors, setSelectedSensors] = useState(new Set([
    "FF_ref", "shr_461", "hr100_927", "hr_455", "fxo_540", "fxo_547"
  ]));
  const [hoveredSensor, setHoveredSensor] = useState(null);
  const [activeMount, setActiveMount] = useState(null);
  const [circlePos, setCirclePos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasW, setCanvasW] = useState(700);
  const [mountTab, setMountTab] = useState("MV");
  // Track collapsed/expanded state for each group
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setCanvasW(containerRef.current.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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
  const n = activeSensors.length;
  const PAD_X   = 28;
  const PAD_TOP = 28;
  const PAD_BOT = 52;
  const GAP     = 18;
  const ROW_GAP = 36;          // vertical gap between rows
  const MAX_ROW_H = 260;       // max pixel height of a single row

  // Scale: fit the tallest sensor into MAX_ROW_H
  const maxMmH = n > 0 ? Math.max(...activeSensors.map(s => s.h)) : 1;
  const scale  = n > 0 ? MAX_ROW_H / maxMmH : 1;

  // availW for row-break decisions
  const availW = canvasW - PAD_X * 2;

  // Pack sensors into rows: start a new row when running width exceeds availW
  const rows = [];
  let currentRow = [];
  let rowW = 0;
  activeSensors.forEach(s => {
    const pw = s.w * scale;
    const needed = currentRow.length > 0 ? rowW + GAP + pw : pw;
    if (currentRow.length > 0 && needed > availW) {
      rows.push(currentRow);
      currentRow = [s];
      rowW = pw;
    } else {
      currentRow.push(s);
      rowW = needed;
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);

  // Build rects with x/y positions per row (bottom-aligned within each row)
  const rects = [];
  let rowOriginY = PAD_TOP;
  rows.forEach(row => {
    const rowMaxH = Math.max(...row.map(s => s.h * scale));
    const rowBaselineY = rowOriginY + rowMaxH;
    let cursor = PAD_X;
    row.forEach(s => {
      const pw = s.w * scale;
      const ph = s.h * scale;
      const x  = cursor;
      const y  = rowBaselineY - ph;
      rects.push({ ...s, x, y, pw, ph, cx: x + pw / 2, cy: y + ph / 2, rowBaselineY });
      cursor += pw + GAP;
    });
    rowOriginY = rowBaselineY + ROW_GAP;
  });

  const totalContentH = rowOriginY - ROW_GAP; // remove trailing ROW_GAP
  const canvasH       = totalContentH + PAD_BOT;
  const baselineY     = totalContentH;         // used for scale bar

  // ── Image circle ─────────────────────────────────────────────────────────────
  const mountData   = activeMount ? MOUNT_DB.find(m => m.id === activeMount) : null;
  const circlePxR   = mountData ? (mountData.imageDiameter / 2) * scale : 0;

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
    pt.x = src.clientX;
    pt.y = src.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const onCircleMouseDown = useCallback((e) => {
    if (!mountData) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = getSVGPoint(e);
    dragOffset.current = {
      dx: pt.x - effectiveCirclePos.x,
      dy: pt.y - effectiveCirclePos.y,
    };
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
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
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
      const corners = [
        [r.x, r.y], [r.x + r.pw, r.y],
        [r.x, r.y + r.ph], [r.x + r.pw, r.y + r.ph],
      ];
      const cornerDists = corners.map(([cx, cy]) =>
        Math.sqrt((cx - pos.x) ** 2 + (cy - pos.y) ** 2)
      );
      const maxCornerDist = Math.max(...cornerDists);
      const maxCornerDistMm = maxCornerDist / scale;
      const circleR = mountData.imageDiameter / 2;
      const hasVignetting = maxCornerDistMm > circleR;
      return { id: r.id, name: r.name, hasVignetting, maxCornerDistMm: maxCornerDistMm.toFixed(1), circleR };
    });
  }, [mountData, rects, circlePos, scale]);

  const vigStatusColor = (v) => v.hasVignetting ? "#c0392b" : "#27ae60";
  const canvasHfinal = Math.max(canvasH, 180);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f2f2f0",
      color: "#111",
      fontFamily: sans,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "28px 12px 40px",
    }}>
      {/* ── Header ── */}
      <div style={{ width: "100%", maxWidth: 1200, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <svg width={15} height={15} viewBox="0 0 15 15" fill="none">
            <rect x={0.75} y={0.75} width={13.5} height={13.5} stroke="#111" strokeWidth={1.5}/>
            <rect x={3.5} y={3.5} width={8} height={8} stroke="#111" strokeWidth={1}/>
            <circle cx={7.5} cy={7.5} r={1.5} fill="#111"/>
          </svg>
          <span style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#999", fontFamily: mono }}>
            Allied Vision · Machine Vision
          </span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: -0.3, fontFamily: mono }}>
          Optical Format Comparator
        </h1>
        <p style={{ fontSize: 11, color: "#999", margin: "3px 0 0" }}>
          FXO · HR · SHR series sensors · select sensors · overlay image circles · drag to check coverage
        </p>
      </div>

      {/* ── Three-column layout ── */}
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── LEFT: Sensor list with collapsible groups ── */}
        <SidePanel title="Sensors">
          <div style={{ padding: "5px 7px", borderBottom: "1px solid #eee", display: "flex", gap: 5 }}>
            {[
              ["All", () => { setSelectedSensors(new Set(SENSOR_DB.map(s => s.id))); setCirclePos(null); }],
              ["None", () => { setSelectedSensors(new Set()); setCirclePos(null); }]
            ].map(([label, fn]) => (
              <MiniButton key={label} onClick={fn}>{label}</MiniButton>
            ))}
          </div>
          <div style={{ overflowY: "auto", maxHeight: 620 }}>
            {SENSOR_GROUPS.map((group) => {
              const isCollapsed = collapsedGroups.has(group.id);
              const selectedInGroup = group.sensors.filter(s => selectedSensors.has(s.id)).length;
              const isAVGroup = group.id !== "reference";

              return (
                <div key={group.id}>
                  {/* Group header — clickable to collapse/expand */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    style={{
                      width: "100%", background: "#fafafa",
                      border: "none", borderBottom: "1px solid #e8e8e8",
                      borderLeft: `3px solid ${group.color}`,
                      padding: "7px 10px 7px 9px",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7, textAlign: "left",
                    }}
                  >
                    {/* Chevron */}
                    <svg width={10} height={10} viewBox="0 0 10 10" style={{ flexShrink: 0, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                      <polyline points="2,3.5 5,6.5 8,3.5" fill="none" stroke={group.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: group.color, fontFamily: mono, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {group.label}
                      </div>
                    </div>
                    {selectedInGroup > 0 && (
                      <div style={{ flexShrink: 0, background: group.color, color: "#fff", fontSize: 8, fontFamily: mono, fontWeight: 700, borderRadius: 9, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>
                        {selectedInGroup}
                      </div>
                    )}
                  </button>

                  {/* Sensor rows — hidden when collapsed */}
                  {!isCollapsed && group.sensors.map((s) => {
                    const isOn = selectedSensors.has(s.id);
                    const diag = Math.sqrt(s.w ** 2 + s.h ** 2).toFixed(1);
                    // Thumbnail scale relative to largest sensor overall (SHR 811: 66×44mm)
                    const maxW = 66.44, maxH = 44.30;
                    const tw = Math.max(4, Math.round((s.w / maxW) * 24));
                    const th = Math.max(2, Math.round((s.h / maxH) * 16));
                    return (
                      <button key={s.id} onClick={() => toggleSensor(s.id)}
                        style={{
                          width: "100%", background: isOn ? "#f5f5f5" : "#fff",
                          border: "none", borderBottom: "1px solid #f2f2f2",
                          padding: "6px 11px 6px 15px",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 7, textAlign: "left",
                        }}
                      >
                        <Checkbox checked={isOn} color={isOn ? group.color : undefined} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: isOn ? 600 : 400, color: isOn ? "#111" : "#aaa", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: 7.5, color: isOn ? "#666" : "#ccc", fontFamily: mono, marginTop: 1 }}>
                            {s.w}×{s.h}mm · ⌀{diag}mm
                          </div>
                          {isAVGroup && (
                            <div style={{ fontSize: 7, color: isOn ? "#aaa" : "#ddd", fontFamily: mono, marginTop: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {s.note}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, width: 26, height: 18, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                          <div style={{
                            width: tw, height: th,
                            background: isOn ? group.color : "#ebebeb",
                            opacity: isOn ? 0.35 : 1,
                            border: `1px solid ${isOn ? group.color : "#ccc"}`,
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
            style={{ background: "#fff", border: "1px solid #d8d8d8", borderRadius: 3, position: "relative", overflow: "hidden", userSelect: "none" }}
          >
            <svg ref={svgRef} width={canvasW} height={canvasHfinal} style={{ display: "block", cursor: isDragging ? "grabbing" : "default" }}>
              <defs>
                <pattern id="dots2" x={0} y={0} width={20} height={20} patternUnits="userSpaceOnUse">
                  <circle cx={10} cy={10} r={0.7} fill="#e8e8e8" />
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
                const rowH = Math.max(...row.map(s => s.h * scale));
                const rowY = rects.filter(r => row.some(s => s.id === r.id)).reduce((acc, r) => Math.max(acc, r.y + r.ph), 0);
                const rowRects = rects.filter(r => row.some(s => s.id === r.id));
                const x1 = Math.min(...rowRects.map(r => r.x)) - 10;
                const x2 = Math.max(...rowRects.map(r => r.x + r.pw)) + 10;
                return <line key={ri} x1={x1} y1={rowY} x2={x2} y2={rowY} stroke="#ccc" strokeWidth={0.75} strokeDasharray="3 3" />;
              })}

              {/* ── Sensor rects ── */}
              {rects.map((r) => {
                const isHov = hoveredSensor === r.id;
                const fillColor = isHov ? "#e0e0e0" : "#d4d4d4";
                const accentColor = r.groupColor || "#555";
                return (
                  <g key={r.id} style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredSensor(r.id)}
                    onMouseLeave={() => setHoveredSensor(null)}>
                    {/* Sensor body */}
                    <rect x={r.x} y={r.y} width={r.pw} height={r.ph}
                      fill={fillColor} stroke={isHov ? accentColor : "#888"} strokeWidth={isHov ? 1.5 : 1}
                      style={{ transition: "fill 0.1s" }} />
                    {/* Diagonal cross lines */}
                    <line x1={r.x} y1={r.y} x2={r.x + r.pw} y2={r.y + r.ph} stroke="rgba(0,0,0,0.07)" strokeWidth={0.7} style={{ pointerEvents: "none" }} />
                    <line x1={r.x + r.pw} y1={r.y} x2={r.x} y2={r.y + r.ph} stroke="rgba(0,0,0,0.07)" strokeWidth={0.7} style={{ pointerEvents: "none" }} />
                    {/* Center dot */}
                    <circle cx={r.cx} cy={r.cy} r={1.5} fill={accentColor} opacity={0.3} style={{ pointerEvents: "none" }} />
                    {/* Group color top bar */}
                    <rect x={r.x} y={r.y} width={r.pw} height={Math.min(3, r.ph * 0.08)} fill={accentColor} opacity={0.5} style={{ pointerEvents: "none" }} />

                    {/* Vignetting overlay */}
                    {mountData && (() => {
                      const pos = effectiveCirclePos;
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
                            fill="rgba(160,30,30,0.30)" mask={`url(#${maskId})`} />
                        </g>
                      );
                    })()}

                    {/* Width dimension */}
                    {r.pw > 24 && (
                      <g style={{ pointerEvents: "none" }}>
                        <line x1={r.x} y1={r.y - 10} x2={r.x} y2={r.y - 5} stroke="#aaa" strokeWidth={0.75} />
                        <line x1={r.x + r.pw} y1={r.y - 10} x2={r.x + r.pw} y2={r.y - 5} stroke="#aaa" strokeWidth={0.75} />
                        <line x1={r.x + 1} y1={r.y - 7} x2={r.x + r.pw - 1} y2={r.y - 7} stroke="#aaa" strokeWidth={0.75} />
                        {r.pw > 36 && <>
                          <rect x={r.x + r.pw / 2 - 18} y={r.y - 15} width={36} height={10} fill="#fff" rx={1} />
                          <text x={r.x + r.pw / 2} y={r.y - 7} textAnchor="middle" fontSize={8} fill="#666" fontFamily={mono} style={{ pointerEvents: "none" }}>{r.w}mm</text>
                        </>}
                      </g>
                    )}
                    {/* Format label inside */}
                    {r.pw > 38 && r.ph > 22 && (
                      <text x={r.cx} y={r.cy + 4} textAnchor="middle"
                        fontSize={Math.max(7, Math.min(11, r.ph / 3.5))}
                        fill="rgba(0,0,0,0.22)" fontFamily={mono} fontWeight={500} style={{ pointerEvents: "none" }}>
                        {r.format}
                      </text>
                    )}
                    {/* Below-baseline label */}
                    <text x={r.cx} y={r.rowBaselineY + 14} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#111" fontFamily={mono} style={{ pointerEvents: "none" }}>
                      {r.name.split(" · ")[0]}
                    </text>
                    <text x={r.cx} y={r.rowBaselineY + 25} textAnchor="middle" fontSize={7.5} fill="#999" fontFamily={mono} style={{ pointerEvents: "none" }}>
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
                      stroke="#1a5fcc" strokeWidth={1.5} strokeDasharray="5 3"
                      style={{ cursor: isDragging ? "grabbing" : "grab", pointerEvents: "all" }}
                      onMouseDown={onCircleMouseDown}
                      onTouchStart={onCircleMouseDown}
                    />
                    <line x1={pos.x - 8} y1={pos.y} x2={pos.x + 8} y2={pos.y} stroke="#1a5fcc" strokeWidth={1} opacity={0.6} style={{ pointerEvents: "none" }} />
                    <line x1={pos.x} y1={pos.y - 8} x2={pos.x} y2={pos.y + 8} stroke="#1a5fcc" strokeWidth={1} opacity={0.6} style={{ pointerEvents: "none" }} />
                    <circle cx={pos.x} cy={pos.y} r={2} fill="#1a5fcc" opacity={0.7} style={{ pointerEvents: "none" }} />
                    <rect x={pos.x - 24} y={pos.y - circlePxR - 16} width={48} height={13} fill="rgba(255,255,255,0.88)" rx={2} style={{ pointerEvents: "none" }} />
                    <text x={pos.x} y={pos.y - circlePxR - 5}
                      textAnchor="middle" fontSize={8.5} fill="#1a5fcc" fontFamily={mono} fontWeight={600}
                      style={{ pointerEvents: "none" }}>
                      ⌀{mountData.imageDiameter}mm
                    </text>
                    {!isDragging && (
                      <text x={pos.x} y={pos.y + circlePxR + 13}
                        textAnchor="middle" fontSize={8} fill="#1a5fcc" fontFamily={mono} opacity={0.6}
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
                  <line x1={PAD_X} y1={canvasHfinal - 13} x2={PAD_X + scaleMm * scale} y2={canvasHfinal - 13} stroke="#bbb" strokeWidth={1.5} />
                  <line x1={PAD_X} y1={canvasHfinal - 16} x2={PAD_X} y2={canvasHfinal - 10} stroke="#bbb" strokeWidth={1} />
                  <line x1={PAD_X + scaleMm * scale} y1={canvasHfinal - 16} x2={PAD_X + scaleMm * scale} y2={canvasHfinal - 10} stroke="#bbb" strokeWidth={1} />
                  <text x={PAD_X + scaleMm * scale + 6} y={canvasHfinal - 9} fontSize={8} fill="#bbb" fontFamily={mono}>{scaleMm} mm</text>
                </g>
              )}

              {n === 0 && (
                <text x={canvasW / 2} y={90} textAnchor="middle" fontSize={11} fill="#ccc" letterSpacing={2} fontFamily={mono}>SELECT SENSORS TO COMPARE</text>
              )}
            </svg>

            {/* Sensor hover tooltip */}
            {hoveredSensor && (() => {
              const r = rects.find(x => x.id === hoveredSensor);
              if (!r) return null;
              const diag = Math.sqrt(r.w ** 2 + r.h ** 2).toFixed(2);
              return (
                <div style={{ position: "absolute", top: 8, right: 8, background: "#fff", border: "1px solid #ddd", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", padding: "9px 13px", borderRadius: 3, fontSize: 11, lineHeight: 1.9, color: "#666", minWidth: 185, pointerEvents: "none", fontFamily: mono }}>
                  <div style={{ fontWeight: 700, color: "#111", marginBottom: 4, fontSize: 11 }}>{r.name}</div>
                  {r.note && <div style={{ fontSize: 8.5, color: "#aaa", marginBottom: 6, lineHeight: 1.5 }}>{r.note}</div>}
                  <Row k="W" v={`${r.w} mm`} />
                  <Row k="H" v={`${r.h} mm`} />
                  <Row k="Diagonal" v={`${diag} mm`} />
                  <Row k="Area" v={`${(r.w * r.h).toFixed(1)} mm²`} />
                  <Row k="MP" v={`${r.mp} MP`} />
                  <Row k="Format" v={r.format} />
                </div>
              );
            })()}
          </div>

          {/* Info bar */}
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#bbb", fontFamily: mono }}>
            <span>{n} sensor{n !== 1 ? "s" : ""} selected{mountData ? ` · ${mountData.name} (⌀${mountData.imageDiameter}mm)` : ""}</span>
            {n > 1 && (() => {
              const lg = activeSensors[0], sm = activeSensors[activeSensors.length - 1];
              return <span>{lg.w.toFixed(1)}×{lg.h.toFixed(1)} / {sm.w.toFixed(1)}×{sm.h.toFixed(1)}: {(lg.w * lg.h / (sm.w * sm.h)).toFixed(1)}× area</span>;
            })()}
          </div>

          {/* Vignetting analysis */}
          {circleAnalysis && (
            <div style={{ marginTop: 10, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "7px 12px", borderBottom: "1px solid #eee", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontFamily: mono }}>
                Coverage Analysis · {mountData.name}
              </div>
              {circleAnalysis.map(v => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid #f5f5f5", fontSize: 10, fontFamily: mono }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: vigStatusColor(v), flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "#333", fontWeight: 500 }}>{v.name}</span>
                  {v.hasVignetting
                    ? <span style={{ color: "#c0392b" }}>Corner outside by {(v.maxCornerDistMm - v.circleR).toFixed(1)}mm</span>
                    : <span style={{ color: "#27ae60" }}>Fully covered ✓</span>
                  }
                  <span style={{ color: "#bbb", fontSize: 9 }}>max ⌀{(v.maxCornerDistMm * 2)}mm</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Mount list ── */}
        <SidePanel title="Image Circles / Mounts">
          <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
            {[["MV", "Machine Vision"], ["Photo", "Photo"]].map(([val, label]) => (
              <button key={val} onClick={() => setMountTab(val)} style={{
                flex: 1, padding: "7px 0", border: "none",
                background: mountTab === val ? "#f5f5f5" : "#fff",
                borderBottom: mountTab === val ? "2px solid #111" : "2px solid transparent",
                fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
                color: mountTab === val ? "#111" : "#bbb", cursor: "pointer", fontFamily: mono,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ padding: "5px 7px", borderBottom: "1px solid #eee" }}>
            <MiniButton onClick={() => { setActiveMount(null); setCirclePos(null); }}>Clear circle</MiniButton>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 570 }}>
            {MOUNT_DB.filter(m => m.type === mountTab).map((m) => {
              const isOn = activeMount === m.id;
              const maxD = Math.max(...MOUNT_DB.filter(x => x.type === mountTab).map(x => x.imageDiameter));
              const thumbR = Math.max(3, Math.round((m.imageDiameter / maxD) * 12));
              return (
                <button key={m.id}
                  onClick={() => { setActiveMount(isOn ? null : m.id); setCirclePos(null); }}
                  style={{
                    width: "100%", background: isOn ? "#f0f4ff" : "#fff",
                    border: "none", borderBottom: "1px solid #f2f2f2",
                    padding: "8px 11px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 9, textAlign: "left",
                  }}>
                  <div style={{ flexShrink: 0, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{
                      width: thumbR * 2, height: thumbR * 2, borderRadius: "50%",
                      border: `1.5px ${isOn ? "solid" : "dashed"} ${isOn ? "#1a5fcc" : "#bbb"}`,
                      background: isOn ? "rgba(26,95,204,0.08)" : "transparent",
                      transition: "all 0.1s",
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: isOn ? 600 : 400, color: isOn ? "#1a5fcc" : "#444", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: 8, color: isOn ? "#5580cc" : "#bbb", fontFamily: mono, marginTop: 1 }}>⌀{m.imageDiameter}mm</div>
                    <div style={{ fontSize: 7.5, color: "#ccc", fontFamily: mono, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.notes}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </SidePanel>

      </div>

      {/* Legend */}
      <div style={{ width: "100%", maxWidth: 1200, marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {SENSOR_GROUPS.filter(g => g.id !== "reference").map(g => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, background: g.color, opacity: 0.5, borderRadius: 1, border: `1px solid ${g.color}` }} />
            <span style={{ fontSize: 9, color: "#999", fontFamily: mono, letterSpacing: 0.5 }}>{g.id.toUpperCase()}</span>
          </div>
        ))}
        <span style={{ fontSize: 9, color: "#ccc", fontFamily: mono, letterSpacing: 1, marginLeft: "auto" }}>
          Dimensions are nominal · for reference only · red = outside image circle
        </span>
      </div>
    </div>
  );
}

// ── Small shared components ────────────────────────────────────────────────────

function SidePanel({ title, children }) {
  return (
    <div style={{ flex: "0 0 210px", background: "#fff", border: "1px solid #d8d8d8", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ padding: "9px 12px 7px", borderBottom: "1px solid #eee", fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", color: "#bbb", fontFamily: "'IBM Plex Mono', monospace" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MiniButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: "#f5f5f5", border: "1px solid #e0e0e0", color: "#888",
      fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
      padding: "5px 10px", borderRadius: 2, cursor: "pointer",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>{children}</button>
  );
}

function Checkbox({ checked, color = "#111" }) {
  return (
    <div style={{
      width: 13, height: 13, flexShrink: 0, borderRadius: 2,
      border: `1.5px solid ${checked ? color : "#ccc"}`,
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
      <span>{k}</span><span style={{ color: "#111" }}>{v}</span>
    </div>
  );
}
