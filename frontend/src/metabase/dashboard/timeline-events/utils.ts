import { isQuestionDashCard } from "metabase/utils/dashboard";
import {
  type TimeseriesXAxis,
  canDisplayTimelineEvents,
  extendCardWithDashcardSettings,
  getComputedSettingsForSeries,
  getTimeseriesXAxis,
} from "metabase/viz-core";
import type {
  DashCardDataMap,
  DashboardCard,
  RawSeries,
  VisualizationDisplay,
} from "metabase-types/api";
import { isVisualizerDashboardCard } from "metabase-types/guards/dashboard";

const getDashCardDisplay = (
  dashcard: DashboardCard,
): VisualizationDisplay | null | undefined =>
  isVisualizerDashboardCard(dashcard)
    ? dashcard.visualization_settings.visualization.display
    : dashcard.card?.display;

export const canDashCardDisplayTimelineEvents = (dashcard: DashboardCard) =>
  canDisplayTimelineEvents(getDashCardDisplay(dashcard));

export const computeDashCardTimeseriesXAxis = (
  dashcard: DashboardCard,
  dashcardData: DashCardDataMap[number] | undefined,
): TimeseriesXAxis | null => {
  if (!isQuestionDashCard(dashcard) || isVisualizerDashboardCard(dashcard)) {
    return null;
  }
  const cards = [
    extendCardWithDashcardSettings(
      dashcard.card,
      dashcard.visualization_settings,
    ),
    ...(dashcard.series ?? []),
  ];
  const series: RawSeries = cards.flatMap((card) => {
    const dataset = dashcardData?.[card.id];
    return dataset?.data ? [{ card, ...dataset }] : [];
  });
  if (series.length === 0) {
    return null;
  }
  return getTimeseriesXAxis(series, getComputedSettingsForSeries(series));
};
