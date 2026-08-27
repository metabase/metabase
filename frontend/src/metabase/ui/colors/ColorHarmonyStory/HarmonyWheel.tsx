/* eslint-disable metabase/no-color-literals -- storybook demo */
import Color from "color";
import { useCallback, useRef, useState } from "react";

import { Box } from "metabase/ui";
import { suggestHarmonyColors } from "metabase/ui/colors/harmonies";

import { PillLabel } from "./PillLabel";
import {
  ANCHOR_MARKER_RADIUS,
  BRAND_SWATCH_RADIUS,
  CHART_SWATCH_RADIUS,
  HUE_GRADIENT_STOPS,
  RING_INNER,
  RING_OUTER,
  SQUARE_SIDE_SWATCH_RADIUS,
  VERTEX_RADIUS,
  WHEEL_CENTER_X,
  WHEEL_CENTER_Y,
  WHEEL_HEIGHT,
  WHEEL_WIDTH,
  isLightColor,
  polarPoint,
} from "./geometry";

const POSITIVE_HUE = 89;
const NEGATIVE_HUE = 359;
const SQUARE_INDICES = [0, 2, 4, 6] as const;

interface HarmonyWheelProps {
  brand: string;
  onBrandChange: (next: string) => void;
}

/**
 * Interactive hue wheel that visualises the brand harmony.
 *
 * - The colored donut is a `conic-gradient` masked into a ring.
 * - Eight chart-color dots sit on the octagonal vertices (brand + i·45°).
 * - The square overlay highlights the four square-harmony positions
 *   (brand, filter, ignored complement, summarize).
 * - Positive (hue 89) and negative (hue 359) markers anchor outside the ring.
 * - A transparent glass layer on top of the SVG owns the drag gesture: the
 *   brand hue rotates by the cursor's angular delta from where it was grabbed,
 *   so the swatch never teleports.
 */
export function HarmonyWheel({ brand, onBrandChange }: HarmonyWheelProps) {
  const c = Color(brand);
  const brandHue = c.hue();

  const harmony = suggestHarmonyColors(brand);

  const octVertices = Array.from({ length: 8 }, (_, i) => {
    const hue = (brandHue + i * 45 + 360) % 360;
    const [x, y] = polarPoint(VERTEX_RADIUS, hue);
    return { hue, x, y, color: harmony.charts[i] };
  });

  const squarePoints = SQUARE_INDICES.map((i) => octVertices[i]);

  const [posX, posY] = polarPoint(RING_OUTER + 26, POSITIVE_HUE);
  const [negX, negY] = polarPoint(RING_OUTER + 26, NEGATIVE_HUE);

  const [isDragging, setIsDragging] = useState(false);
  const brandRef = useRef(brand);
  brandRef.current = brand;

  const handleGlassPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const layer = e.currentTarget;
      const rect = layer.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const thetaAt = (clientX: number, clientY: number) =>
        (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;

      const originTheta = thetaAt(e.clientX, e.clientY);
      const originHue = Color(brandRef.current).hue();

      setIsDragging(true);

      const onMove = (ev: PointerEvent) => {
        const delta = thetaAt(ev.clientX, ev.clientY) - originTheta;
        const newHue = (((originHue + delta) % 360) + 360) % 360;
        onBrandChange(Color(brandRef.current).hue(newHue).hex().toLowerCase());
      };
      const onEnd = () => {
        setIsDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [onBrandChange],
  );

  return (
    <Box
      style={{
        position: "relative",
        width: WHEEL_WIDTH,
        height: WHEEL_HEIGHT,
        flexShrink: 0,
        userSelect: isDragging ? "none" : "auto",
      }}
    >
      {/* Hue donut */}
      <Box
        style={{
          position: "absolute",
          left: WHEEL_CENTER_X - RING_OUTER,
          top: WHEEL_CENTER_Y - RING_OUTER,
          width: RING_OUTER * 2,
          height: RING_OUTER * 2,
          borderRadius: "50%",
          background: `conic-gradient(from 0deg, ${HUE_GRADIENT_STOPS})`,
          maskImage: `radial-gradient(circle, transparent ${RING_INNER}px, black ${RING_INNER + 1}px, black ${RING_OUTER}px, transparent ${RING_OUTER + 1}px)`,
          WebkitMaskImage: `radial-gradient(circle, transparent ${RING_INNER}px, black ${RING_INNER + 1}px, black ${RING_OUTER}px, transparent ${RING_OUTER + 1}px)`,
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
        }}
      />

      <svg
        width={WHEEL_WIDTH}
        height={WHEEL_HEIGHT}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <polygon
          points={octVertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="rgba(0,0,0,0.025)"
          stroke="rgba(0,0,0,0.28)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        <polygon
          points={squarePoints.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={2}
        />

        {octVertices.map((v, i) => (
          <VertexDot key={i} index={i} x={v.x} y={v.y} color={v.color} />
        ))}

        <CenterSwatch brand={brand} />

        <ExternalMarker
          hue={POSITIVE_HUE}
          x={posX}
          y={posY}
          color={harmony.positive}
        />
        <ExternalMarker
          hue={NEGATIVE_HUE}
          x={negX}
          y={negY}
          color={harmony.negative}
        />
      </svg>

      {/* Every label sits on its swatch's radial line, with its inner edge
          touching the swatch's outer edge — see PillLabel. */}
      <PillLabel
        x={octVertices[0].x}
        y={octVertices[0].y}
        swatchRadius={BRAND_SWATCH_RADIUS}
        text="Brand"
        emphasis
      />
      <PillLabel
        x={octVertices[2].x}
        y={octVertices[2].y}
        swatchRadius={SQUARE_SIDE_SWATCH_RADIUS}
        text="Filter"
        emphasis
      />
      <PillLabel
        x={octVertices[6].x}
        y={octVertices[6].y}
        swatchRadius={SQUARE_SIDE_SWATCH_RADIUS}
        text="Summarize"
        emphasis
      />
      <PillLabel
        x={octVertices[4].x}
        y={octVertices[4].y}
        swatchRadius={CHART_SWATCH_RADIUS}
        text="Ignored"
        muted
      />
      <PillLabel
        x={posX}
        y={posY}
        swatchRadius={ANCHOR_MARKER_RADIUS}
        text="Positive"
      />
      <PillLabel
        x={negX}
        y={negY}
        swatchRadius={ANCHOR_MARKER_RADIUS}
        text="Negative"
      />

      {/* Glass layer: a square overlay sitting on top of the SVG that owns the
          drag gesture. Centered with the wheel; pointer-down anywhere on it
          starts a drag, and the brand hue rotates by the cursor's angular
          delta from grab time — no jumps, no narrow zone. */}
      <Box
        onPointerDown={handleGlassPointerDown}
        style={{
          position: "absolute",
          left: WHEEL_CENTER_X - RING_OUTER - 10,
          top: WHEEL_CENTER_Y - RING_OUTER - 10,
          width: (RING_OUTER + 10) * 2,
          height: (RING_OUTER + 10) * 2,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          background: "transparent",
        }}
      />
    </Box>
  );
}

function VertexDot({
  index,
  x,
  y,
  color,
}: {
  index: number;
  x: number;
  y: number;
  color: string;
}) {
  const isBrand = index === 0;
  const isComplement = index === 4;
  const isFilter = index === 2;
  const isSummarize = index === 6;
  const isSquareSide = isFilter || isSummarize;
  const r = isBrand
    ? BRAND_SWATCH_RADIUS
    : isSquareSide
      ? SQUARE_SIDE_SWATCH_RADIUS
      : CHART_SWATCH_RADIUS;

  return (
    <g transform={`translate(${x},${y})`}>
      {isBrand && (
        <circle
          r={r + 7}
          fill="none"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={2}
          strokeDasharray="2 3"
        />
      )}
      <circle
        r={r}
        fill={color}
        stroke="white"
        strokeWidth={3}
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))" }}
      />
      {isComplement && (
        <>
          <line
            x1={-7}
            y1={-7}
            x2={7}
            y2={7}
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <line
            x1={-7}
            y1={7}
            x2={7}
            y2={-7}
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

function CenterSwatch({ brand }: { brand: string }) {
  return (
    <>
      <circle
        cx={WHEEL_CENTER_X}
        cy={WHEEL_CENTER_Y}
        r={66}
        fill={brand}
        stroke="white"
        strokeWidth={5}
        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.14))" }}
      />
      <text
        x={WHEEL_CENTER_X}
        y={WHEEL_CENTER_Y + 4}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill={isLightColor(brand) ? "#1c1c1f" : "#ffffff"}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {brand}
      </text>
    </>
  );
}

function ExternalMarker({
  hue,
  x,
  y,
  color,
}: {
  hue: number;
  x: number;
  y: number;
  color: string;
}) {
  const [ringX, ringY] = polarPoint(RING_OUTER + 4, hue);
  return (
    <g>
      <line
        x1={ringX}
        y1={ringY}
        x2={x}
        y2={y}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={1}
      />
      <circle
        cx={x}
        cy={y}
        r={ANCHOR_MARKER_RADIUS}
        fill={color}
        stroke="white"
        strokeWidth={2.5}
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))" }}
      />
    </g>
  );
}
