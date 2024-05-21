export type ChartColor =
  | string
  | {
      base: string;
      lighter?: string;
      darker?: string;
    };

type EightOrLess<T> =
  | []
  | [T]
  | [T, T]
  | [T, T, T]
  | [T, T, T, T]
  | [T, T, T, T, T]
  | [T, T, T, T, T, T]
  | [T, T, T, T, T, T, T]
  | [T, T, T, T, T, T, T, T];

export type ChartColors = EightOrLess<ChartColor>;
