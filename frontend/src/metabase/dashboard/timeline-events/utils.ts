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

// "timeline_events.enabled" is a question-only setting, so dashcard settings can't override it
export const canDashCardDisplayTimelineEvents = (
  dashcard: DashboardCard,
): dashcard is QuestionDashboardCard =>
  isQuestionDashCard(dashcard) &&
  !isVisualizerDashboardCard(dashcard) &&
  canDisplayTimelineEvents(dashcard.card.display) &&
  dashcard.card.visualization_settings?.["timeline_events.enabled"] !== false;

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
