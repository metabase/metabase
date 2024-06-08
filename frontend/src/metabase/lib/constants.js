import { t } from "ttag";

export const SEARCH_DEBOUNCE_DURATION = 300;

export const DEFAULT_SEARCH_LIMIT = 50;

// A part of hack required to work with both null and 0
// values in numeric dimensions
export const NULL_NUMERIC_VALUE = -Infinity;

export const NULL_DISPLAY_VALUE = t`(empty)`;

/** The normal sidebar width, in pixels, of the righthand info sidebar on Dashboard and Question pages */
export const DEFAULT_SIDEBAR_WIDTH_FOR_QUESTIONS_AND_DASHBOARDS = 384;
