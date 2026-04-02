import type { CardDisplayType } from "metabase-types/api";

export type ChartTypeGroup = {
  label: string;
  testId: string;
  items: CardDisplayType[];
};
