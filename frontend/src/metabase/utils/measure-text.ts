import _ from "underscore";

export type FontStyle = {
  size: string | number;
  family: string;
  weight: string | number;
};

export interface TextSize {
  width: number;
  height: number;
}

export type TextWidthMeasurer = (
  text: string,
  style: FontStyle,
) => TextSize["width"];

export type TextHeightMeasurer = (
  text: string,
  style: FontStyle,
) => TextSize["height"];

export type TextMeasurer = (text: string, style: FontStyle) => TextSize;

let canvas: HTMLCanvasElement | null = null;

export const measureText: TextMeasurer = (text: string, style: FontStyle) => {
  if (!canvas) {
    canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.style.display = "none";
    canvas.style.fontSize = window.getComputedStyle(
      document.documentElement,
    ).fontSize;
  }

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

const styleDefaults = {
  size: "14px",
  family: "sans-serif",
  weight: "normal",
};

export const measureTextWidth = (text: string, style?: Partial<FontStyle>) =>
  measureText(text, _.defaults(style, styleDefaults)).width;

export const measureTextHeight = (text: string, style?: Partial<FontStyle>) =>
  measureText(text, _.defaults(style, styleDefaults)).height;
