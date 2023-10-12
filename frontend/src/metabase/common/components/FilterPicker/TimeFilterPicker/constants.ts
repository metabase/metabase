import moment from "moment";
import type { OperatorOption } from "./types";

export const DEFAULT_VALUE = moment().startOf("day").toDate(); // 00:00:00

export const OPERATOR_OPTIONS: OperatorOption[] = [
  {
    operator: "<",
    valueCount: 1,
  },
  {
    operator: ">",
    valueCount: 1,
  },
  {
    operator: "between",
    valueCount: 2,
  },
  {
    operator: "is-null",
    valueCount: 0,
  },
  {
    operator: "not-null",
    valueCount: 0,
  },
];
