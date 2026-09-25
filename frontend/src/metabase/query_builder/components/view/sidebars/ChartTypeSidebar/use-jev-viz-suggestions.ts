import { useEffect, useMemo, useState } from "react";

import { type VizSuggestColumn, useSuggestVizMutation } from "metabase/api/jev";
import type { Dataset, VisualizationDisplay } from "metabase-types/api";

/** Charts scoring at or above this are highlighted; also capped at the top few. */
const HIGHLIGHT_THRESHOLD = 0.5;
const MAX_HIGHLIGHTS = 4;

export interface JevVizSuggestions {
  scores: Partial<Record<VisualizationDisplay, number>>;
  recommendedTypes: Set<VisualizationDisplay>;
  structure?: string;
}

/**
 * Ask Jev to rank chart types for a query result. The heavy lifting is deterministic (Metabase's own
 * result-column metadata gives each column's role); Jev only scores each chart against that structure.
 * Returns a score map + the highlighted (top-ranked) set for the chart-type picker.
 */
export function useJevVizSuggestions(
  result: Dataset | null | undefined,
): JevVizSuggestions {
  const [suggestViz] = useSuggestVizMutation();
  const [suggestion, setSuggestion] = useState<JevVizSuggestions>({
    scores: {},
    recommendedTypes: new Set(),
  });

  const cols = result?.data?.cols;

  useEffect(() => {
    if (!cols || cols.length === 0) {
      setSuggestion({ scores: {}, recommendedTypes: new Set() });
      return;
    }

    let cancelled = false;
    const body = {
      cols: cols.map(
        (col): VizSuggestColumn => ({
          name: col.name,
          base_type: col.base_type ?? undefined,
          semantic_type: col.semantic_type ?? null,
          source: col.source ?? undefined,
          unit: col.unit ?? null,
        }),
      ),
    };

    suggestViz(body)
      .unwrap()
      .then((res) => {
        if (cancelled) {
          return;
        }
        const scores: Partial<Record<VisualizationDisplay, number>> = {};
        for (const { display, score } of res.ranked) {
          scores[display as VisualizationDisplay] = score;
        }
        const recommendedTypes = new Set(
          res.ranked
            .filter((r) => r.score >= HIGHLIGHT_THRESHOLD)
            .slice(0, MAX_HIGHLIGHTS)
            .map((r) => r.display as VisualizationDisplay),
        );
        setSuggestion({ scores, recommendedTypes, structure: res.structure });
      })
      .catch(() => {
        // Advisory only — a failed suggestion just means no highlights.
        if (!cancelled) {
          setSuggestion({ scores: {}, recommendedTypes: new Set() });
        }
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch when the result's column shape changes, not on every render.
  }, [cols, suggestViz]);

  return useMemo(() => suggestion, [suggestion]);
}
