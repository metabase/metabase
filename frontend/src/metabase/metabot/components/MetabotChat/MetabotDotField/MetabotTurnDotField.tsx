import cx from "classnames";
import { useEffect, useRef } from "react";

import { color } from "metabase/ui/colors";

import S from "./MetabotTurnDotField.module.css";
import { DOT_BASE_ALPHA, DOT_PITCH, smoothstep } from "./dot-field";

const FALLBACK_BRAND = color("metabase-brand");

// Rows below the thinking frontier we still paint (the loader's halo).
const HALO_ROWS = 6;
// A row holds solid dots this long after it's reserved before it starts fading.
const DELAY_MS = 160;
// Per-dot disappearance times spread across this window (→ ~2.5s total).
const SPREAD_MS = 2150;
// How long an individual dot takes to fade once it starts.
const INDIV_MS = 150;
const DOT_RADIUS = 1.15;
const THINKING_FIELD_PADDING = 16;
const THINKING_FALLBACK_ROWS_ABOVE = 4;
const THINKING_FALLBACK_ROWS_BELOW = 15;
const THINKING_BOTTOM_FADE_ROWS = 8;
const THINKING_MIN_BOTTOM_ALPHA = 0.1;

const modulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

const firstRowAtOrAfterY = (y: number, phaseY: number): number =>
  Math.ceil((y - phaseY - DOT_PITCH / 2) / DOT_PITCH);

const yForRow = (row: number, phaseY: number): number =>
  phaseY + DOT_PITCH / 2 + row * DOT_PITCH;

const thinkingRowVisibility = (y: number, top: number, bottom: number) => {
  const fadeHeight = THINKING_BOTTOM_FADE_ROWS * DOT_PITCH;
  const fadeStart = Math.max(top, bottom - fadeHeight);
  const fade = smoothstep((y - fadeStart) / Math.max(1, bottom - fadeStart));
  return 1 - fade * (1 - THINKING_MIN_BOTTOM_ALPHA);
};

const clearRowsInRange = (
  reserved: Map<number, number>,
  completed: Set<number>,
  phaseY: number,
  topY: number,
  bottomY: number,
) => {
  if (bottomY <= topY) {
    return;
  }

  const rowStart = firstRowAtOrAfterY(topY - DOT_PITCH, phaseY) - 1;
  const rowEnd = firstRowAtOrAfterY(bottomY + DOT_PITCH, phaseY) + 1;
  for (let row = rowStart; row <= rowEnd; row++) {
    reserved.delete(row);
    completed.delete(row);
  }
};

const syncCanvasHeight = (canvas: HTMLCanvasElement) => {
  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const height = Math.ceil(
    Math.max(parent.scrollHeight, parent.getBoundingClientRect().height),
  );
  if (height <= 0) {
    return;
  }

  const currentHeight = Number.parseFloat(canvas.style.height);
  if (!Number.isFinite(currentHeight) || Math.abs(currentHeight - height) > 1) {
    canvas.style.height = `${height}px`;
  }
};

// Cheap deterministic per-dot noise in [0,1) — stable across frames without
// needing to size/track an array as the field grows.
const dotNoise = (row: number, col: number): number => {
  let h = (Math.imul(row, 73856093) ^ Math.imul(col, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

type MetabotTurnDotFieldProps = {
  className?: string;
};

/**
 * A single dot field for the whole agent turn, painted behind the streamed
 * content. Each lattice row records when the thinking "frontier" first passed
 * below it (i.e. when that strip became reserved content); the row holds solid
 * dots briefly, then its dots fade out individually over ~2.5s with a wide
 * random spread. Because it is ONE field, there are no per-block seams and no
 * overlapping leftover dots — the lattice simply dissolves from the top down as
 * content settles, keeping a halo of dots around the loader while it generates.
 */
export const MetabotTurnDotField = ({
  className,
}: MetabotTurnDotFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // row index (in canvas-local lattice space) → ms timestamp it was reserved
  const reservedRef = useRef<Map<number, number>>(new Map());
  const completedRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef({ x: 0, y: 0 });
  const lastFrontierYRef = useRef<number | null>(null);
  const turnTopYRef = useRef<number | null>(null);
  const colorRef = useRef<string>(FALLBACK_BRAND);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const brand = getComputedStyle(canvas)
      .getPropertyValue("--mb-color-brand")
      .trim();
    if (brand) {
      colorRef.current = brand;
    }

    const reserved = reservedRef.current;
    const completed = completedRef.current;
    let raf = 0;

    const draw = () => {
      syncCanvasHeight(canvas);
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const pixelWidth = Math.max(1, Math.round(w * dpr));
      const pixelHeight = Math.max(1, Math.round(h * dpr));
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();

      // The loader is the canonical lattice source. Deriving phase from its
      // actual DOM position keeps the faint field dots exactly under the loader
      // dots even as layout shifts.
      const loader = document.querySelector<HTMLElement>(
        '[data-testid="metabot-response-loader"]',
      );
      const loaderRect = loader?.getBoundingClientRect();
      const hasActiveLoader =
        loaderRect != null && loader?.dataset.metabotLoaderState !== "exiting";
      const thinkingFieldRect = loader
        ?.closest<HTMLElement>("[data-metabot-thinking-state]")
        ?.getBoundingClientRect();
      let phaseX = phaseRef.current.x;
      let phaseY = phaseRef.current.y;
      const previousFrontierY = lastFrontierYRef.current;
      let frontierY = previousFrontierY ?? h;
      let loaderTopY: number | null = null;
      let loaderBottomY: number | null = null;
      if (loaderRect) {
        const loaderX = loaderRect.left - rect.left;
        const loaderY = loaderRect.top - rect.top;
        loaderTopY = loaderY;
        loaderBottomY = loaderRect.bottom - rect.top;
        phaseX = modulo(loaderX, DOT_PITCH);
        phaseY = modulo(loaderY, DOT_PITCH);
        phaseRef.current = { x: phaseX, y: phaseY };
        frontierY = loaderY + 2 * DOT_PITCH;
        if (
          previousFrontierY != null &&
          frontierY > previousFrontierY + DOT_PITCH
        ) {
          clearRowsInRange(
            reserved,
            completed,
            phaseY,
            previousFrontierY - DOT_PITCH,
            frontierY + HALO_ROWS * DOT_PITCH,
          );
        }
        lastFrontierYRef.current = frontierY;
      }
      const fieldTopY = thinkingFieldRect
        ? thinkingFieldRect.top - rect.top
        : null;
      const fieldBottomY = thinkingFieldRect
        ? thinkingFieldRect.bottom - rect.top + THINKING_FIELD_PADDING
        : null;
      const loaderProtectedTopY =
        loaderTopY == null
          ? null
          : loaderTopY -
            THINKING_FIELD_PADDING -
            THINKING_FALLBACK_ROWS_ABOVE * DOT_PITCH;
      const loaderProtectedBottomY =
        loaderBottomY == null
          ? null
          : loaderBottomY +
            THINKING_FIELD_PADDING +
            THINKING_FALLBACK_ROWS_BELOW * DOT_PITCH;
      const protectedTopY =
        fieldTopY ?? loaderProtectedTopY ?? Number.POSITIVE_INFINITY;
      const protectedBottomY = Math.max(
        fieldBottomY ?? Number.NEGATIVE_INFINITY,
        loaderProtectedBottomY ?? Number.NEGATIVE_INFINITY,
      );
      const hasProtectedThinkingBand =
        Number.isFinite(protectedTopY) && Number.isFinite(protectedBottomY);

      const userMessages = document.querySelectorAll<HTMLElement>(
        '[data-message-role="user"]',
      );
      const lastUser = userMessages[userMessages.length - 1];
      const turnTopY = lastUser
        ? Math.max(0, lastUser.getBoundingClientRect().bottom - rect.top)
        : 0;
      if (
        turnTopYRef.current == null ||
        Math.abs(turnTopY - turnTopYRef.current) > DOT_PITCH
      ) {
        reserved.clear();
        completed.clear();
        turnTopYRef.current = turnTopY;
      }

      const upperBoundY = loaderRect
        ? Math.max(frontierY + HALO_ROWS * DOT_PITCH, protectedBottomY)
        : h + DOT_PITCH;
      const turnTopRow = firstRowAtOrAfterY(turnTopY, phaseY);
      const visibleEndRow = firstRowAtOrAfterY(h + DOT_PITCH, phaseY) + 1;
      const rowStart = turnTopRow;
      const rowEnd = loaderRect
        ? Math.min(visibleEndRow, firstRowAtOrAfterY(upperBoundY, phaseY) + 1)
        : visibleEndRow;
      const colStart = Math.floor((-phaseX - DOT_PITCH / 2) / DOT_PITCH);
      const colEnd = Math.ceil((w - phaseX - DOT_PITCH / 2) / DOT_PITCH);

      const BUCKETS = 12;
      const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);

      for (let row = rowStart; row < rowEnd; row++) {
        const y = yForRow(row, phaseY);
        const d = y - frontierY;
        const isProtectedThinkingRow =
          hasActiveLoader &&
          hasProtectedThinkingBand &&
          y >= protectedTopY &&
          y <= protectedBottomY;

        if (isProtectedThinkingRow) {
          const visibility = thinkingRowVisibility(
            y,
            protectedTopY,
            protectedBottomY,
          );
          const bucket = Math.min(BUCKETS - 1, (visibility * BUCKETS) | 0);
          reserved.delete(row);
          completed.delete(row);
          for (let col = colStart; col <= colEnd; col++) {
            const x = phaseX + DOT_PITCH / 2 + col * DOT_PITCH;
            if (x < -DOT_RADIUS || x > w + DOT_RADIUS) {
              continue;
            }
            buckets[bucket].push(x, y);
          }
          continue;
        }

        if (hasActiveLoader && d > 0) {
          // Halo just below the loader — persists while generating.
          reserved.delete(row);
          completed.delete(row);
          const vis = 1 - smoothstep(d / (HALO_ROWS * DOT_PITCH));
          if (vis <= 0.04) {
            continue;
          }
          const bucket = Math.min(BUCKETS - 1, (vis * BUCKETS) | 0);
          for (let col = colStart; col <= colEnd; col++) {
            const x = phaseX + DOT_PITCH / 2 + col * DOT_PITCH;
            if (x < -DOT_RADIUS || x > w + DOT_RADIUS) {
              continue;
            }
            buckets[bucket].push(x, y);
          }
          continue;
        }

        // Content area: reserve on first sight, then fade per-dot after a beat.
        if (completed.has(row)) {
          continue;
        }
        let reservedAt = reserved.get(row);
        if (reservedAt == null) {
          if (!loaderRect) {
            continue;
          }
          reservedAt = now;
          reserved.set(row, now);
        }
        const t = now - reservedAt;
        if (t > DELAY_MS + SPREAD_MS + INDIV_MS) {
          reserved.delete(row);
          completed.add(row);
          continue;
        }
        for (let col = colStart; col <= colEnd; col++) {
          const x = phaseX + DOT_PITCH / 2 + col * DOT_PITCH;
          if (x < -DOT_RADIUS || x > w + DOT_RADIUS) {
            continue;
          }
          const n = dotNoise(row, col);
          const fade = smoothstep((t - DELAY_MS - n * SPREAD_MS) / INDIV_MS);
          const aNorm = 1 - fade;
          if (aNorm <= 0.04) {
            continue;
          }
          const bucket = Math.min(BUCKETS - 1, (aNorm * BUCKETS) | 0);
          buckets[bucket].push(x, y);
        }
      }

      ctx.fillStyle = colorRef.current;
      for (let b = 0; b < BUCKETS; b++) {
        const arr = buckets[b];
        if (!arr.length) {
          continue;
        }
        ctx.globalAlpha = DOT_BASE_ALPHA * ((b + 0.5) / BUCKETS);
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 2) {
          const x = arr[k];
          const yy = arr[k + 1];
          ctx.moveTo(x + DOT_RADIUS, yy);
          ctx.arc(x, yy, DOT_RADIUS, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef} className={cx(S.canvas, className)} aria-hidden />
  );
};
