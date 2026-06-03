import cx from "classnames";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import S from "./MetabotDotField.module.css";
import {
  DOT_BASE_ALPHA,
  DOT_PITCH,
  type DotFieldFrame,
  drawDotField,
  makeDotNoise,
} from "./dot-field";

// Only used until the real (possibly white-labeled) brand color is read from
// the CSS cascade on mount; canvas fillStyle needs a concrete color string.
// eslint-disable-next-line metabase/no-color-literals -- pre-resolution fallback
const FALLBACK_BRAND = "rgb(80, 158, 227)";

export type MetabotDotFieldHandle = {
  /** Paint one frame. Cheap; call from a rAF loop. */
  renderFrame: (frame: DotFieldFrame) => void;
};

type MetabotDotFieldProps = {
  pitch?: number;
  baseAlpha?: number;
  className?: string;
};

/**
 * Full-bleed canvas that paints the Metabot dot field. It owns canvas sizing
 * (DPR-aware) and the stable per-dot noise; the surrounding animation drives it
 * imperatively via `renderFrame` so high-frequency updates never re-render React.
 */
export const MetabotDotField = forwardRef<
  MetabotDotFieldHandle,
  MetabotDotFieldProps
>(function MetabotDotField(
  { pitch = DOT_PITCH, baseAlpha = DOT_BASE_ALPHA, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const noiseRef = useRef<Float32Array>(makeDotNoise(0, 0));
  const colorRef = useRef(FALLBACK_BRAND);
  const lastFrameRef = useRef<DotFieldFrame>({
    thinkingY: 0,
    fadeProgress: 0,
  });

  const paint = useCallback(
    (frame: DotFieldFrame) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        return;
      }
      lastFrameRef.current = frame;
      const { width, height, dpr } = sizeRef.current;
      drawDotField(ctx, {
        width,
        height,
        dpr,
        pitch,
        noise: noiseRef.current,
        thinkingY: frame.thinkingY,
        fadeProgress: frame.fadeProgress,
        thinkingFade: frame.thinkingFade ?? 0,
        color: colorRef.current,
        baseAlpha,
        originY: frame.originY ?? 0,
      });
    },
    [pitch, baseAlpha],
  );

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    canvas.width = Math.max(1, width * dpr);
    canvas.height = Math.max(1, height * dpr);
    sizeRef.current = { width, height, dpr };
    noiseRef.current = makeDotNoise(
      Math.ceil(width / pitch),
      Math.ceil(height / pitch),
    );
    // Resolve the (possibly white-labeled) brand color from the cascade.
    const brand = getComputedStyle(canvas)
      .getPropertyValue("--mb-color-brand")
      .trim();
    if (brand) {
      colorRef.current = brand;
    }
    paint(lastFrameRef.current);
  }, [pitch, paint]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resize]);

  useImperativeHandle(ref, () => ({ renderFrame: paint }), [paint]);

  return (
    <canvas ref={canvasRef} className={cx(S.canvas, className)} aria-hidden />
  );
});
