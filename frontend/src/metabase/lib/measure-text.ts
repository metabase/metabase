import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";

export const createTextMeasurer =
  (canvas: HTMLCanvasElement): TextMeasurer =>
  (text, style) => {
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

export const measureText = createTextMeasurer(document.createElement("canvas"));

export const measureTextWidth = (text: string, style: FontStyle) =>
  measureText(text, style).width;
