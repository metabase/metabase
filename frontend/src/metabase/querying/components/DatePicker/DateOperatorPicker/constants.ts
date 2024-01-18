import { t } from "ttag";
import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: OperatorOption[] = [
  {
    label: t`All time`,
    value: "none",
    operators: [],
  },
  {
    label: t`Previous`,
    value: "last",
    operators: [],
  },
  {
    label: t`Next`,
    value: "next",
    operators: [],
  },
  {
    label: t`Current`,
    value: "current",
    operators: [],
  },
  {
    label: t`Before`,
    value: "<",
    operators: ["<"],
  },
  {
    label: t`After`,
    value: ">",
    operators: [">"],
  },
  {
    label: t`On`,
    value: "=",
    operators: ["="],
  },
  {
    label: t`Between`,
    value: "between",
    operators: ["between"],
  },
  {
    label: t`Is empty`,
    value: "is-null",
    operators: ["is-null"],
  },
  {
    label: t`Not empty`,
    value: "not-null",
    operators: ["not-null"],
  },
];
