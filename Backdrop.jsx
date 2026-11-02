import { useMemo } from "react";
import "./backdrop.css";

// Seeded pseudorandom generator for deterministic, consistent rendering across re-renders
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function Skyline({ seed, count, minHeight, maxHeight, lit = false, className, showBeacons = false }) {
  const buildings = useMemo(() => {
    const random = seededRandom(seed);
    const slot = 1600 / count;
    return Array.from({ length: count }, (_, index) => {
      const width = slot * (0.76 + random() * 0.44);
      const height = minHeight + random() * (maxHeight - minHeight);
      const x = index * slot - 10;
      const windows = [];
      
      // Roof styles: flat, stepped, antenna, crown
      const roofStyle = random();
      const hasAntenna = roofStyle > 0.65;
      const antennaHeight = 22 + random() * 32;
      const hasCrown = roofStyle < 0.25;
      const hasStepped = roofStyle >= 0.25 && roofStyle < 0.45;

      if (lit) {
        const rows = Math.floor(height / 24);
        const cols = Math.floor(width / 16);
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            // Clustered light patterns like real office towers
            const p = random();
            if (p > 0.60) {
              const windowType = p > 0.92 ? "cyan" : p > 0.78 ? "warm" : "gold";
              windows.push({
                x: x + 6 + col * 16,
                y: 400 - height + 10 + row * 24,
                w: col % 3 === 0 ? 8 : 6,
                h: 9,
                type: windowType
              });
            }
          }
        }
      }

      return {
        x,
        width,
        height,
        windows,
        hasAntenna,
        antennaHeight,
        hasCrown,
        hasStepped,
        beacon: showBeacons && hasAntenna && random() > 0.4,
      };
    });
  }, [seed, count, minHeight, maxHeight, lit, showBeacons]);

  return (
    <svg className={className} viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {buildings.map((b, i) => {
        const topY = 400 - b.height;
        return (
          <g key={i}>
            {/* Main Tower Body */}
            <rect x={b.x} y={topY} width={b.width} height={b.height} />

            {/* Stepped Architectural Details */}
            {b.hasStepped && (
              <>
                <rect x={b.x + b.width * 0.15} y={topY - 14} width={b.width * 0.7} height="14" />
                <rect x={b.x + b.width * 0.3} y={topY - 24} width={b.width * 0.4} height="10" />
              </>
            )}

            {/* Art-Deco Spire Crown */}
            {b.hasCrown && (
              <polygon
                points={`${b.x + b.width * 0.2},${topY} ${b.x + b.width * 0.5},${topY - 28} ${b.x + b.width * 0.8},${topY}`}
              />
            )}

            {/* Communication Antenna Spire */}
            {b.hasAntenna && (
              <g>
                <rect
                  x={b.x + b.width / 2 - 1.5}
                  y={topY - b.antennaHeight}
                  width="3"
                  height={b.antennaHeight}
                />
                {b.beacon && (
                  <circle
                    className="beacon-light"
                    cx={b.x + b.width / 2}
                    cy={topY - b.antennaHeight}
                    r="3.5"
                  />
                )}
              </g>
            )}

            {/* Illuminated Windows */}
            {b.windows.map((win, wi) => (
              <rect
                key={wi}
                className={`lit-window lit-${win.type}`}
                x={win.x}
                y={win.y}
                width={win.w}
                height={win.h}
                rx="1"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PalmTree({ className }) {
  return (
    <svg className={className} viewBox="0 0 240 560" aria-hidden="true">
      <path className="palm-trunk" d="M110 560 C 130 420, 95 280, 120 140" />
      <g className="palm-fronds">
        <path d="M120 140 C 75 96, 32 102, 4 142" />
        <path d="M120 140 C 85 78, 48 54, 16 58" />
        <path d="M120 140 C 120 80, 134 38, 164 12" />
        <path d="M120 140 C 162 88, 202 80, 234 100" />
        <path d="M120 140 C 162 120, 208 128, 236 168" />
        <path d="M120 140 C 82 128, 46 152, 32 196" />
        <path d="M120 140 C 145 150, 185 160, 210 200" />
      </g>
    </svg>
  );
}

// Cinematic Dusk Backdrop with multi-layer SVG skyline, dramatic sunset, and light trails
export default function DuskBackdrop({ variant = "welcome" }) {
  return (
    <div className={`dusk-backdrop is-${variant}`} aria-hidden="true">
      {/* Sky Ambient Glows */}
      <div className="sky-gradient-overlay" />
      
      {/* Sunset Sun with Corona and atmospheric stripes */}
      <div className="sun-container">
        <div className="landing-sun" />
        <div className="sun-glow-ring" />
      </div>

      {/* Atmospheric Star / Twilight Dust Particles */}
      <div className="twilight-particles" />

      {/* Multi-tier Skyline Layers */}
      <Skyline className="layer layer-haze" seed={7} count={32} minHeight={60} maxHeight={180} />
      <Skyline className="layer layer-far" seed={19} count={24} minHeight={90} maxHeight={250} />
      <Skyline className="layer layer-mid" seed={37} count={17} minHeight={130} maxHeight={340} lit showBeacons />
      <Skyline className="layer layer-near" seed={61} count={11} minHeight={180} maxHeight={390} lit showBeacons />

      {/* Horizon Warm Atmosphere Light */}
      <div className="horizon-glow" />

      {/* Foreground Framing Palms */}
      <PalmTree className="palm palm-left" />
      <PalmTree className="palm palm-right" />

      {/* Highway Light Streaks & Ground Fog */}
      <div className="road-glow" />
      <span className="streak streak-red" />
      <span className="streak streak-white" />
      <span className="streak streak-amber" />
      <div className="landing-shade" />
    </div>
  );
}
