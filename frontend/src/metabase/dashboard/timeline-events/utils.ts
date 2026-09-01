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
  QuestionDashboardCard,
  RawSeries,
} from "metabase-types/api";
import { isVisualizerDashboardCard } from "metabase-types/guards/dashboard";

export const canDashCardDisplayTimelineEvents = (
  dashcard: DashboardCard,
): dashcard is QuestionDashboardCard =>
  isQuestionDashCard(dashcard) &&
  !isVisualizerDashboardCard(dashcard) &&
  canDisplayTimelineEvents(dashcard.card.display);

export const isDashCardDataLoaded = (
  dashcard: DashboardCard,
  dashcardData: DashCardDataMap[number] | undefined,
) => isQuestionDashCard(dashcard) && dashcardData?.[dashcard.card.id] != null;

export const computeDashCardTimeseriesXAxis = (
  dashcard: DashboardCard,
  dashcardData: DashCardDataMap[number] | undefined,
): TimeseriesXAxis | null => {
  if (!canDashCardDisplayTimelineEvents(dashcard)) {
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
