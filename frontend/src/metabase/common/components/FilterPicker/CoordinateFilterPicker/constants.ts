import { t } from "ttag";
import type { Option } from "./types";

export const OPTIONS: Option[] = [
  {
    name: t`Is`,
    operator: "=",
    valueCount: Infinity,
  },
  {
    name: t`Is not`,
    operator: "!=",
    valueCount: Infinity,
  },
  {
    name: t`Inside`,
    operator: "inside",
    valueCount: 4,
  },
  {
    name: t`Greater than`,
    operator: ">",
    valueCount: 1,
  },
  {
    name: t`Less than`,
    operator: "<",
    valueCount: 1,
  },
  {
    name: t`Between`,
    operator: "between",
    valueCount: 2,
  },
  {
    name: t`Greater than or equal to`,
    operator: ">=",
    valueCount: 1,
  },
  {
    name: t`Less than or equal to`,
    operator: "<=",
    valueCount: 1,
  },
];
