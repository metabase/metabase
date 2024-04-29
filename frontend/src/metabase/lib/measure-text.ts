import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";

let canvas: HTMLCanvasElement | null = null;

export const measureText: TextMeasurer = (text: string, style: FontStyle) => {
  canvas ??= document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context");
  }

  const fontSize =
    typeof style.size === "number" ? `${style.size}px` : style.size;

  context.font = `${style.weight} ${fontSize} ${style.family}`;
  const textMetrics = context.measureText(text);

  return {
    width: textMetrics.width,
    height:
      textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent,
  };
};

export const measureTextWidth = (text: string, style: FontStyle) =>
  measureText(text, style).width;
