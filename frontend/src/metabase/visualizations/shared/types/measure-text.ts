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

export type TextMeasurer = (text: string, style: FontStyle) => TextSize;
