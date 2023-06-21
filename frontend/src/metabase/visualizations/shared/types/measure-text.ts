export type FontStyle = {
  size: string | number;
  family: string;
  weight: string | number;
};

export type TextMeasurer = (text: string, style: FontStyle) => TextMetrics;
