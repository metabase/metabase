export type FontStyle = {
  size: string | number;
  family?: string;
  weight: string | number;
};

export type TextWidthMeasurer = (text: string, style: FontStyle) => number;

export type TextHeightMeasurer = (text: string, style: FontStyle) => number;
