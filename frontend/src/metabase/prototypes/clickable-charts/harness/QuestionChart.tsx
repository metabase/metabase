import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import { Box, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { type CardDisplayType, isCardDisplayType } from "metabase-types/api";

import type { ChartCanvasProps } from "../types";

import { ALL_DRILLS_CLICK_MODE } from "./drillMode";
import { useQueryResults } from "./useQueryResults";

export const CHART_HEIGHT = 440;

type QuestionChartProps = ChartCanvasProps & {
  height?: number;
};

/**
 * Today's chart: the real `Visualization` with the real drills. Clicking a
 * point opens the click-actions popover; the chosen drill writes a new query
 * (and possibly a new display) back through `onChange`.
 */
export function QuestionChart({
  query,
  display,
  settings,
  height = CHART_HEIGHT,
  onChange,
}: QuestionChartProps) {
  const metadataProvider = useMetadataProviderUnfiltered(Lib.databaseID(query));
  const { rawSeries, isFetching, error } = useQueryResults({
    query,
    display,
    settings,
  });

  return (
    <Box>
      {error && <Text c="feedback-negative">{error}</Text>}
      <Box
        h={height}
        pos="relative"
        style={{ opacity: isFetching ? 0.5 : 1, transition: "opacity 150ms" }}
      >
        {rawSeries ? (
          <Visualization
            queryBuilderMode="dataset"
            rawSeries={rawSeries}
            mode={ALL_DRILLS_CLICK_MODE}
            onChangeCardAndRun={({ nextCard }) =>
              onChange(
                Lib.fromJsQuery(metadataProvider, nextCard.dataset_query),
                toDisplay(nextCard.display, display),
              )
            }
          />
        ) : (
          isFetching && <Loader />
        )}
      </Box>
    </Box>
  );
}

function toDisplay(
  candidate: string | undefined,
  fallback: CardDisplayType,
): CardDisplayType {
  return isCardDisplayType(candidate) ? candidate : fallback;
}
