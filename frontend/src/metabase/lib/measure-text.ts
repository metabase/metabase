import _ from "underscore";

import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";

let canvas: HTMLCanvasElement | null = null;

const convertRemToPx = (fontSize: string): string => {
  const remMatch = fontSize.match(/^([\d.]+)rem$/);
  if (remMatch) {
    const remValue = parseFloat(remMatch[1]);
    const rootFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    return `${remValue * rootFontSize}px`;
  }
  return fontSize;
};

export const measureText: TextMeasurer = (text: string, style: FontStyle) => {
  canvas ??= document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context");
  }

  const fontSize =
    typeof style.size === "number"
      ? `${style.size}px`
      : convertRemToPx(style.size);

  context.font = `${style.weight} ${fontSize} ${style.family}`;
  const textMetrics = context.measureText(text);

  return {
    width: textMetrics.width,
    height:
      textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent,
  };
};

const styleDefaults = {
  size: "14px",
  family: "sans-serif",
  weight: "normal",
};

export const measureTextWidth = (text: string, style?: Partial<FontStyle>) =>
  measureText(text, _.defaults(style, styleDefaults)).width;

export const measureTextHeight = (text: string, style?: Partial<FontStyle>) =>
  measureText(text, _.defaults(style, styleDefaults)).height;
