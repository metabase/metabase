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

export const OPERATOR_OPTIONS_MAP = _.indexBy(OPERATOR_OPTIONS, "operator");
