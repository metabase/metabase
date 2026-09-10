import { t } from "ttag";

export const SEARCH_DEBOUNCE_DURATION = 500;

export const DEFAULT_SEARCH_LIMIT = 50;

export const EMPTY_CELL_PLACEHOLDER = "—";

// Pie and treemap slice settings persist this key for a null dimension value.
// It stays the untranslated label so a chart saved in one locale keeps its
// slice settings when it is opened in another.
export const NULL_DIMENSION_KEY = "(empty)";

export const getNullDisplayValue = () => t`(empty)`;
