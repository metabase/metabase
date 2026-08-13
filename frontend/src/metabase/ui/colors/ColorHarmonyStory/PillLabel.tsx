/* eslint-disable metabase/no-color-literals -- storybook demo */
import { useLayoutEffect, useRef, useState } from "react";

import { Box } from "metabase/ui";

import {
  WHEEL_CENTER_X,
  WHEEL_CENTER_Y,
  WHEEL_LABEL_PADDING,
} from "./geometry";

interface PillLabelProps {
  /** Center of the swatch the label is attached to. */
  x: number;
  y: number;
  /**
   * Visible radius of the swatch (in pixels). The label's closest point
   * (treating the pill as a stadium / discorectangle) is placed at exactly
   * `swatchRadius + WHEEL_LABEL_PADDING` from the swatch center, so the gap between
   * the swatch's outer edge and the label is uniform at every angle.
   */
  swatchRadius: number;
  text: string;
  emphasis?: boolean;
  muted?: boolean;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Solves for the distance `t` between the swatch center and the label center
 * such that the closest point of the label (modelled as a stadium — a
 * rectangle of size (W−H)×H flanked by two semicircular caps of radius H/2,
 * which is exactly what `borderRadius: 999` produces for a pill) is `D` away
 * from the swatch center.
 *
 * Two regimes:
 *
 * - **Cap regime** (closest point lies on one of the rounded ends): the
 *   swatch sits "east" or "west" of the central segment, beyond its
 *   endpoints. Distance from swatch to a cap-end equals `D' = D + H/2` from
 *   the cap center, giving a quadratic in `t`:
 *   `(t·|cos θ| − halfFlat)² + (t·sin θ)² = D'²`,
 *   solved as `t = halfFlat·|cos θ| + √(D'² − halfFlat²·sin²θ)`.
 *
 * - **Flat regime** (closest point lies on the rectangular top/bottom): the
 *   swatch sits "above" or "below" within the central segment's x-range.
 *   The closest point is the perpendicular foot on the flat side, so
 *   `D' = t·|sin θ|`, giving `t = D' / |sin θ|`.
 *
 * Cardinal-aligned labels collapse to the trivial answers (`W/2 + D` for
 * east/west, `D + H/2` for north/south).
 */
const labelDistanceFromSwatch = (
  unitX: number,
  unitY: number,
  size: Size,
  D: number,
): number => {
  const { width: W, height: H } = size;
  const halfFlat = Math.max(0, (W - H) / 2);
  const Dprime = D + H / 2;

  const absCos = Math.abs(unitX);
  const absSin = Math.abs(unitY);

  // Cap regime
  const radicand = Dprime * Dprime - halfFlat * halfFlat * absSin * absSin;
  const tCap = halfFlat * absCos + Math.sqrt(Math.max(0, radicand));

  // The cap solution is valid when the projection of the swatch onto the
  // label's x-axis falls outside the central segment. Otherwise the closest
  // point is on the flat top/bottom and we use the perpendicular distance.
  if (tCap * absCos > halfFlat) {
    return tCap;
  }

  return Dprime / Math.max(absSin, 1e-6);
};

export function PillLabel({
  x,
  y,
  swatchRadius,
  text,
  emphasis = false,
  muted = false,
}: PillLabelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  // Measure synchronously after layout so the next frame paints the label at
  // its solved position. Skip updates when the size hasn't meaningfully
  // changed to avoid a re-render loop.
  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    setSize((prev) => {
      if (
        prev &&
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5
      ) {
        return prev;
      }
      return { width: rect.width, height: rect.height };
    });
  }, []);

  const dx = x - WHEEL_CENTER_X;
  const dy = y - WHEEL_CENTER_Y;
  const r = Math.hypot(dx, dy) || 1;
  const ux = dx / r;
  const uy = dy / r;

  const D = swatchRadius + WHEEL_LABEL_PADDING;
  const distFromSwatch = size ? labelDistanceFromSwatch(ux, uy, size, D) : 0;
  const totalR = r + distFromSwatch;

  const lx = WHEEL_CENTER_X + ux * totalR;
  const ly = WHEEL_CENTER_Y + uy * totalR;

  return (
    <Box
      ref={ref}
      style={{
        position: "absolute",
        left: lx,
        top: ly,
        transform: "translate(-50%, -50%)",
        // Hide on the very first paint until we've measured the label;
        // otherwise the label flashes one frame at distFromSwatch = 0.
        opacity: size ? 1 : 0,
        fontSize: 11,
        fontWeight: emphasis ? 600 : muted ? 400 : 500,
        color: muted ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.85)",
        background: "rgba(255,255,255,0.95)",
        padding: "3px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
      }}
    >
      {text}
    </Box>
  );
}
