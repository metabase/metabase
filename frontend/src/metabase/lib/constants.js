import { t } from "ttag";

// A part of hack required to work with both null and 0
// values in numeric dimensions
export const NULL_NUMERIC_VALUE = -Infinity;

export const NULL_DISPLAY_VALUE = t`(empty)`;
