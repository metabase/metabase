import { t } from "ttag";

import type { DashboardFocus } from "metabase/api/jev";
import type {
  JevFilterSuggestion,
  JevFilterSuggestions,
} from "metabase/api/jev-filters";
import type { JevPaletteRowSpec } from "metabase/querying/jev-filters";

/** Palette row id for "focus the dashboard on this question"; can't collide with parameter ids. */
export const FOCUS_ROW_ID = "jev-dashboard-focus";
export const FOCUS_PARAMETER_TYPE = "jev/focus";

/** Top level of the backend's 4-level card relevance rubric (scores run 0..3). */
const MAX_RELEVANCE_SCORE = 3;
const MAX_TITLES_IN_LABEL = 2;

export function getFocusRowSpec(
  activeFocus: DashboardFocus | null,
): JevPaletteRowSpec {
  return {
    id: FOCUS_ROW_ID,
    name: t`Focus cards`,
    icon: "sparkles",
    currentValue: activeFocus ? t`On “${activeFocus.intent}”` : t`Off`,
  };
}

function getFocusLabel(titles: string[]): string {
  const shown = titles.slice(0, MAX_TITLES_IN_LABEL).join(", ");
  const hiddenCount = titles.length - MAX_TITLES_IN_LABEL;
  return hiddenCount > 0 ? t`${shown} +${hiddenCount} more` : shown;
}

/**
 * A focus result as a palette suggestion: one option (focus on the top cards) whose confidence is the
 * best card's relevance, so a dashboard that fits the question well starts selected and a weak fit
 * starts on "No change".
 */
export function getFocusSuggestion(
  focus: DashboardFocus | null,
): JevFilterSuggestion | null {
  const focusedTitles = (focus?.cards ?? [])
    .filter((card) => card.focused)
    .map((card) => card.title);
  if (!focus?.available || focusedTitles.length === 0) {
    return null;
  }
  const topScore = Math.max(...focus.cards.map((card) => card.score));
  const confidence = Math.min(1, Math.max(0, topScore / MAX_RELEVANCE_SCORE));
  const label = getFocusLabel(focusedTitles);
  return {
    parameter_id: FOCUS_ROW_ID,
    parameter_name: t`Focus cards`,
    parameter_type: FOCUS_PARAMETER_TYPE,
    value: focus.intent,
    label,
    confidence,
    alternatives: [
      {
        value: focus.intent,
        label,
        probability: confidence,
        parameter_type: FOCUS_PARAMETER_TYPE,
      },
    ],
  };
}

/** Fold the focus suggestion into the filter suggestions the palette renders. */
export function combineSuggestions({
  filters,
  focus,
  elapsedMs,
}: {
  filters: JevFilterSuggestions | null;
  focus: JevFilterSuggestion | null;
  elapsedMs: number;
}): JevFilterSuggestions {
  const filterSuggestions = filters?.filters ?? [];
  return {
    status: focus ? "ok" : (filters?.status ?? "unavailable"),
    filters: focus ? [focus, ...filterSuggestions] : filterSuggestions,
    candidate_count: filters?.candidate_count ?? 0,
    elapsed_ms: Math.round(elapsedMs),
    usage: filters?.usage,
  };
}
