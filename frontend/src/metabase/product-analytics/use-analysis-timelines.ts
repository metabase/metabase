import { useCallback, useMemo, useState } from "react";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import type { TimelineSidebarProps } from "metabase/timelines/panel/components/TimelineSidebar";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { filterTimelinesByXAxes } from "metabase/timelines/panel/utils";
import {
  getCollectionTimelinesVisibility,
  getRecordedTimelineEventsVisibility,
  isSameTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type {
  TimelineEventsVisibilityUpdate,
  VisualizationPassThroughProps,
} from "metabase/visualizations/types";
import {
  extractRemappings,
  getComputedSettingsForSeries,
  getTimeseriesXAxis,
  getVisualizationTransformed,
  isTimeseries,
} from "metabase/viz-core";
import type {
  CollectionId,
  RawSeries,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
  VisualizationSettings,
} from "metabase-types/api";

type UseAnalysisTimelinesArgs = {
  /** The chart's series; null until there's a result. */
  rawSeries: RawSeries | null;
  /** The chart's settings, which record which events it shows. */
  chartSettings: VisualizationSettings;
  /** Where a new analysis's events default from, and new events go. */
  collectionId: CollectionId | null | undefined;
  /** Records a new choice of events in the chart's settings. */
  onChangeVisibility: (visibility: TimelineEventsVisibility) => void;
  /** The Events panel opens, from its button or an event on the chart. */
  onOpen: () => void;
};

export type AnalysisVisualizationTimelineProps = Pick<
  VisualizationPassThroughProps,
  "onOpenTimelines" | "onSelectTimelineEvents" | "onDeselectTimelineEvents"
> & {
  timelineEventsVisibility: TimelineEventsVisibility;
  selectedTimelineEventIds: TimelineEventId[];
};

/**
 * Events on a time series chart, as in the query builder: which timelines'
 * events it shows, the Events panel, and the chart's event chips. A chart
 * that hasn't recorded a choice shows its collection's timelines.
 */
export const useAnalysisTimelines = ({
  rawSeries,
  chartSettings,
  collectionId,
  onChangeVisibility,
  onOpen,
}: UseAnalysisTimelinesArgs) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<TimelineEventId[]>(
    [],
  );
  // Clicking an event chip lists only its events, until "All events".
  const [focusedEventIds, setFocusedEventIds] = useState<
    TimelineEventId[] | null
  >(null);

  const { isTimeseriesChart, xAxes } = useMemo(() => {
    if (rawSeries === null) {
      return { isTimeseriesChart: false, xAxes: null };
    }
    const { series } = getVisualizationTransformed(
      extractRemappings(rawSeries),
    );
    const settings = getComputedSettingsForSeries(series);
    if (!isTimeseries(settings)) {
      return { isTimeseriesChart: false, xAxes: null };
    }
    const xAxis = getTimeseriesXAxis(series, settings);
    return { isTimeseriesChart: true, xAxes: xAxis ? [xAxis] : null };
  }, [rawSeries]);

  const { isLoading, error } = useListTimelinesQuery(
    isTimeseriesChart ? { include: "events" } : skipToken,
  );
  const timelines = useSelector(getTransformedTimelines);

  const visibility = useMemo(
    () =>
      getRecordedTimelineEventsVisibility(chartSettings) ??
      getCollectionTimelinesVisibility(timelines, collectionId),
    [chartSettings, timelines, collectionId],
  );
  const visibleEventIds = useMemo(
    () =>
      resolveVisibleTimelineEvents({
        timelines: filterTimelinesByXAxes(timelines, xAxes),
        visibility,
      }).map((event) => event.id),
    [timelines, xAxes, visibility],
  );

  const handleUpdateVisibility = useCallback(
    (update: TimelineEventsVisibilityUpdate) => {
      const nextVisibility = update(visibility, timelines);
      if (!isSameTimelineEventsVisibility(visibility, nextVisibility)) {
        onChangeVisibility(nextVisibility);
      }
    },
    [visibility, timelines, onChangeVisibility],
  );
  const handleSelectEvents = useCallback(
    (events: TimelineEvent[]) =>
      setSelectedEventIds(events.map((event) => event.id)),
    [],
  );
  const handleDeselectEvents = useCallback(() => setSelectedEventIds([]), []);
  const handleOpen = useCallback(
    (eventIds?: TimelineEventId[]) => {
      setIsOpen(true);
      setFocusedEventIds(eventIds ?? null);
      onOpen();
    },
    [onOpen],
  );
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setFocusedEventIds(null);
  }, []);

  const sidebarProps: TimelineSidebarProps = {
    collectionId,
    timelines,
    visibleEventIds,
    selectedEventIds,
    focusedEventIds,
    xAxes,
    isLoading,
    error,
    onUpdateVisibility: handleUpdateVisibility,
    onSelectEvents: handleSelectEvents,
    onDeselectEvents: handleDeselectEvents,
    onShowAllEvents: () => setFocusedEventIds(null),
    onClose: handleClose,
  };
  const visualizationProps: AnalysisVisualizationTimelineProps = {
    timelineEventsVisibility: visibility,
    selectedTimelineEventIds: selectedEventIds,
    onOpenTimelines: handleOpen,
    onSelectTimelineEvents: handleSelectEvents,
    onDeselectTimelineEvents: handleDeselectEvents,
  };

  return {
    /** Events only show on time series charts, so only they get the button. */
    isAvailable: isTimeseriesChart,
    isOpen: isOpen && isTimeseriesChart,
    open: () => handleOpen(),
    close: handleClose,
    sidebarProps,
    visualizationProps,
  };
};
