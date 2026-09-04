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

const hasTimelineEventsEnabled = (dashcard: QuestionDashboardCard) => {
  const isEnabled =
    dashcard.visualization_settings?.["timeline_events.enabled"] ??
    dashcard.card.visualization_settings?.["timeline_events.enabled"];
  return isEnabled !== false;
};

export const shouldDashCardDisplayTimelineEvents = (
  dashcard: DashboardCard,
): dashcard is QuestionDashboardCard =>
  isQuestionDashCard(dashcard) &&
  !isVisualizerDashboardCard(dashcard) &&
  canDisplayTimelineEvents(dashcard.card.display) &&
  hasTimelineEventsEnabled(dashcard);

export const isDashCardDataLoaded = (
  dashcard: QuestionDashboardCard,
  dashcardData: DashCardDataMap[number] | undefined,
) => dashcardData?.[dashcard.card.id] != null;

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
