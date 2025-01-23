import _ from "underscore";

import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";

export const measureText: TextMeasurer = (text: string, style: FontStyle) => {
  const textElement = document.createElement("span");
  document.body.appendChild(textElement);

  textElement.style.font = style.family;
  textElement.style.fontSize =
    typeof style.size === "number" ? `${style.size}px` : style.size;
  textElement.style.fontWeight = String(style.weight);
  textElement.style.height = "auto";
  textElement.style.width = "auto";
  textElement.style.position = "absolute";
  textElement.style.whiteSpace = "no-wrap";
  textElement.innerHTML = text;

  const width = Math.ceil(textElement.clientWidth);
  const height = Math.ceil(textElement.clientHeight);

  document.body.removeChild(textElement);

  return {
    width,
    height,
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
