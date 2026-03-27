import type { Insight } from "../insight";

export function createMockInsight(insight?: Partial<Insight>): Insight {
  return {
    col: "",
    unit: "month",
    "last-change": 0,
    "last-value": 0,
    "previous-value": 0,
    offset: 0,
    slope: 0,
    ...insight,
  };
}
