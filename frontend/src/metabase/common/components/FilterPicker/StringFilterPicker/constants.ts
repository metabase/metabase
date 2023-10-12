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
    operator: "contains",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    operator: "does-not-contain",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    operator: "starts-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    operator: "ends-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    operator: "is-empty",
    valueCount: 0,
  },
  {
    operator: "not-empty",
    valueCount: 0,
  },
];
