export type AxisRange = {
  min?: number;
  max?: number;
};

export type AxisFormatter = (value: unknown) => string;

export type AxesFormatters = {
  left?: AxisFormatter;
  right?: AxisFormatter;
  bottom: AxisFormatter;
};

export type Padding = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};
