import { t } from "ttag";

export const SEARCH_DEBOUNCE_DURATION = 300;

export const DEFAULT_SEARCH_LIMIT = 50;

// A part of hack required to work with both null and 0
// values in numeric dimensions
export const NULL_NUMERIC_VALUE = -Infinity;

export const NULL_DISPLAY_VALUE = t`(empty)`;
export const EMPTY_STRING_DISPLAY_VALUE = '" "';
