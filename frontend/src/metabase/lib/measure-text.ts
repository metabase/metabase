import {
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

  context.font = `${style.weight} ${style.size} ${style.family}`;
  const textMetrics = context.measureText(text);

  return {
    width: textMetrics.width,
    height:
      textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent,
  };
};
