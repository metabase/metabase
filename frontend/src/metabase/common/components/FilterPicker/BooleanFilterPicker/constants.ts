import { t } from "ttag";
import type { Option } from "./types";

export const OPTIONS: Option[] = [
  {
    name: t`True`,
    operator: "=",
    type: "true",
  },
  {
    name: t`False`,
    operator: "=",
    type: "false",
  },
  {
    name: t`Empty`,
    type: "is-null",
    operator: "is-null",
    isAdvanced: true,
  },
  {
    name: t`Not empty`,
    type: "not-null",
    operator: "not-null",
    isAdvanced: true,
  },
];
