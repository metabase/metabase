export type FontStyle = {
  size: string | number;
  family: string;
  weight: string | number;
};

export interface TextSize {
  width: number;
  height: number;
}

export type TextMeasurer = (text: string, style: FontStyle) => TextSize;
