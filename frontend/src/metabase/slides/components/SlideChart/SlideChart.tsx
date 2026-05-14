import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { Box, Icon, Loader } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { VisualizationDisplay } from "metabase-types/api";

import S from "./SlideChart.module.css";

interface SlideChartProps {
  cardId?: number | null;
  /** Force a particular display (line/bar/pie/...) regardless of the card's
   * configured visualization. Optional. */
  display?: string | null;
  /** Hide the card title even inside the visualization (we render our own). */
  hideTitle?: boolean;
}

/**
 * Renders an embedded Metabase card without any of CardEmbed's editor chrome.
 * Lives at the heart of every slide layout that has a chart slot.
 */
export const SlideChart = ({
  cardId,
  display,
  hideTitle = true,
}: SlideChartProps) => {
  const enabled = cardId != null && cardId > 0;

  const { data: card, isLoading: isCardLoading } = useGetCardQuery(
    enabled ? { id: cardId } : skipToken,
  );
  const { data: dataset, isLoading: isDataLoading } = useGetCardQueryQuery(
    enabled ? { cardId } : skipToken,
  );

  const rawSeries = useMemo(() => {
    if (!card || !dataset) {
      return null;
    }
    return [
      {
        card: display
          ? { ...card, display: display as VisualizationDisplay }
          : card,
        data: dataset.data,
      },
    ];
  }, [card, dataset, display]);

  if (!enabled) {
    return (
      <Box className={S.placeholder}>
        <span>
          <Icon name="line" size={20} style={{ marginBottom: 6 }} />
          <div>{t`Pick a chart to embed`}</div>
        </span>
      </Box>
    );
  }

  if (isCardLoading || isDataLoading || !rawSeries) {
    return (
      <Box className={S.loading}>
        <Loader />
      </Box>
    );
  }

  return (
    <Box className={S.chart}>
      <Visualization
        rawSeries={rawSeries}
        isDashboard={false}
        showTitle={!hideTitle}
        getExtraDataForClick={() => ({})}
      />
    </Box>
  );
};
