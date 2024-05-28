import { t } from "ttag";

import type { OperatorOption, OptionType } from "./types";

export const OPERATOR_OPTIONS: Record<OptionType, OperatorOption> = {
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
    isAdvanced: true,
  },
  "not-null": {
    name: t`Not empty`,
    operator: "not-null",
    type: "not-null",
    isAdvanced: true,
  },
};
