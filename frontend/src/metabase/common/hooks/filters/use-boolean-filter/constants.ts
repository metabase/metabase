import { t } from "ttag";
import type { BooleanOperatorOption, OptionType } from "./types";

export const OPTIONS: Record<OptionType, BooleanOperatorOption> = {
  true: {
    name: t`True`,
    operator: "=",
    type: "true",
  },
  false: {
    name: t`False`,
    operator: "=",
    type: "false",
  },
  "is-null": {
    name: t`Empty`,
    operator: "is-null",
    type: "is-null",
  },
  "not-null": {
    name: t`Not empty`,
    operator: "not-null",
    type: "not-null",
  },
};
