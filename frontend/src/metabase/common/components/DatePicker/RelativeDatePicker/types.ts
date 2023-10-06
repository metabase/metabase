export type IntervalDirection = "past" | "current" | "next";

export interface Tab {
  label: string;
  direction: IntervalDirection;
}
