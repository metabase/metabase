import type { ReactNode } from "react";

import type {
  JevFilterAlternative,
  JevFilterSuggestion,
} from "metabase/api/jev-filters";
import type { IconName, ParameterValueOrArray } from "metabase-types/api";

/** A filter the palette lists before (or regardless of) any suggestion. */
export interface JevPaletteRowSpec {
  id: string;
  name: string;
  icon?: IconName;
  currentValue?: ReactNode;
}

export interface JevPaletteRow extends JevPaletteRowSpec {
  suggestion: JevFilterSuggestion | null;
  /** Cycle order before "No change": Jev's pick first, then its alternatives. */
  options: JevFilterAlternative[];
}

/** Per-row index into `[...options, NO_CHANGE]`. Rows missing here use their default. */
export type JevPaletteSelections = Readonly<Record<string, number>>;

export interface JevAppliedFilter {
  suggestion: JevFilterSuggestion;
  value: ParameterValueOrArray;
  label: string;
  /** The selected option's type, falling back to the row's. */
  parameterType: string;
}
