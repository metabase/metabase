import { t } from "ttag";
import type { Option } from "./types";

export const OPTIONS: Option[] = [
  {
    name: t`Equal to`,
    operator: "=",
    valueCount: Infinity,
  },
  {
    name: t`Not equal to`,
    operator: "!=",
    valueCount: Infinity,
  },
  {
    name: t`Contains`,
    operator: "contains",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    name: t`Does not contain`,
    operator: "does-not-contain",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    name: t`Starts with`,
    operator: "starts-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    name: t`Ends with`,
    operator: "ends-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  {
    name: t`Is empty`,
    operator: "is-empty",
    valueCount: 0,
  },
  {
    name: t`Not empty`,
    operator: "not-empty",
    valueCount: 0,
  },
];
