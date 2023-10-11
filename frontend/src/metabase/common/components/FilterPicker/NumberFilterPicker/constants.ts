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
  {
    name: t`Is empty`,
    operator: "is-null",
    valueCount: 0,
  },
  {
    name: t`Not empty`,
    operator: "not-null",
    valueCount: 0,
  },
];
