import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  getAccentColors,
  getStatusColorRanges,
} from "metabase/lib/colors/groups";

export const COMMON_OPERATOR_NAMES = {
  "is-null": t`is null`,
  "not-null": t`is not null`,
};
export const NUMBER_OPERATOR_NAMES = {
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  "<": t`is less than`,
  ">": t`is greater than`,
  "<=": t`is less than or equal to`,
  ">=": t`is greater than or equal to`,
};
export const STRING_OPERATOR_NAMES = {
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  contains: t`contains`,
  "does-not-contain": t`does not contain`,
  "starts-with": t`starts with`,
  "ends-with": t`ends with`,
};
export const BOOLEAN_OPERATIOR_NAMES = {
  "is-true": t`is true`,
  "is-false": t`is false`,
};

export const ALL_OPERATOR_NAMES = {
  ...NUMBER_OPERATOR_NAMES,
  ...STRING_OPERATOR_NAMES,
  ...BOOLEAN_OPERATIOR_NAMES,
  ...COMMON_OPERATOR_NAMES,
};
// TODO
export const COLORS = getAccentColors({ dark: false });
export const COLOR_RANGES = getStatusColorRanges();
export const DEFAULTS_BY_TYPE = {
  single: {
    columns: [],
    type: "single",
    operator: "=",
    value: "",
    color: COLORS[0],
    highlight_row: false,
  },
  range: {
    columns: [],
    type: "range",
    colors: COLOR_RANGES[0],
    min_type: null,
    max_type: null,
    min_value: 0,
    max_value: 100,
  },
};

export const INPUT_CLASSNAME = cx(CS.mt1, CS.full);
