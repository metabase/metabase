export type FontStyle = {
  size: string;
  family: string;
  weight: string;
};

export type TextMeasurer = (text: string, style: FontStyle) => number;
