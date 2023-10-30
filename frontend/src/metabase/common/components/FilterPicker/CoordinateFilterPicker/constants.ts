import _ from "underscore";
import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: OperatorOption[] = [
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

export const OPERATOR_OPTIONS_MAP = _.indexBy(OPERATOR_OPTIONS, "operator");
