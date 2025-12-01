import { t } from "ttag";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: OperatorOption[] = [
  {
    get label() {
      return t`All time`;
    },
    value: "none",
    operators: [],
  },
  {
    get label() {
      return t`Previous`;
    },
    value: "past",
    operators: [],
  },
  {
    get label() {
      return t`Next`;
    },
    value: "future",
    operators: [],
  },
  {
    get label() {
      return t`Current`;
    },
    value: "current",
    operators: [],
  },
  {
    get label() {
      return t`Before`;
    },
    value: "<",
    operators: ["<"],
  },
  {
    get label() {
      return t`After`;
    },
    value: ">",
    operators: [">"],
  },
  {
    get label() {
      return t`On`;
    },
    value: "=",
    operators: ["="],
  },
  {
    get label() {
      return t`Between`;
    },
    value: "between",
    operators: ["between"],
  },
];
