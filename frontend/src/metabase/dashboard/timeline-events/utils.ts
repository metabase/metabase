import { isQuestionDashCard } from "metabase/utils/dashboard";
import { isTimelineEventsEnabled } from "metabase/visualizations/lib/timeline-events-visibility";
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

export const MIN_TIMELINE_EVENTS_CARD_SIZE = { width: 240, height: 200 };

export const hasSupportedTimelineEventsSize = ({
  width,
  height,
}: {
  width: number;
  height: number;
}): boolean =>
  width >= MIN_TIMELINE_EVENTS_CARD_SIZE.width &&
  height >= MIN_TIMELINE_EVENTS_CARD_SIZE.height;

// "timeline_events.enabled" is a question-only setting, so dashcard settings can't override it
export const shouldDashCardDisplayTimelineEvents = (
  dashcard: DashboardCard,
): dashcard is QuestionDashboardCard =>
  isQuestionDashCard(dashcard) &&
  !isVisualizerDashboardCard(dashcard) &&
  canDisplayTimelineEvents(dashcard.card.display) &&
  isTimelineEventsEnabled(dashcard.card.visualization_settings);

export const computeDashCardTimeseriesXAxis = (
  dashcard: DashboardCard,
  dashcardData: DashCardDataMap[number] | undefined,
): TimeseriesXAxis | null => {
  if (!shouldDashCardDisplayTimelineEvents(dashcard)) {
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
