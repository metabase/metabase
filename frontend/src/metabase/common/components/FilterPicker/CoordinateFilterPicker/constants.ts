import type { Option } from "./types";

export const OPTIONS: Option[] = [
  {
    operator: "=",
    valueCount: Infinity,
  },
  {
    operator: "!=",
    valueCount: Infinity,
  },
  {
    operator: "inside",
    valueCount: 4,
  },
  {
    operator: ">",
    valueCount: 1,
  },
  {
    operator: "<",
    valueCount: 1,
  },
  {
    operator: "between",
    valueCount: 2,
  },
  {
    operator: ">=",
    valueCount: 1,
  },
  {
    operator: "<=",
    valueCount: 1,
  },
];
