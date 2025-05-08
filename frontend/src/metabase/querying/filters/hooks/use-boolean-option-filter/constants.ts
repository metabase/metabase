import { t } from "ttag";

import type { OperatorOption, OptionType } from "./types";

export const OPERATOR_OPTIONS: Record<OptionType, OperatorOption> = {
  true: {
    get name() {
      return t`True`;
    },
    operator: "=",
    type: "true",
  },
  false: {
    get name() {
      return t`False`;
    },
    operator: "=",
    type: "false",
  },
  "is-null": {
    get name() {
      return t`Empty`;
    },
    operator: "is-null",
    type: "is-null",
    isAdvanced: true,
  },
  "not-null": {
    get name() {
      return t`Not empty`;
    },
    operator: "not-null",
    type: "not-null",
    isAdvanced: true,
  },
};
