import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { InputProps } from "metabase/common/components/Input";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { usePageTitle } from "metabase/hooks/use-page-title";
import EventCard from "metabase/timelines/collections/components/EventCard";
import { ListRoot } from "metabase/timelines/collections/components/EventList/EventList.styled";
import LoadingAndErrorWrapper from "metabase/timelines/collections/components/LoadingAndErrorWrapper";
import { Box, Card, Icon, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import S from "./EventsPage.module.css";

type EventWithTimeline = {
  event: TimelineEvent;
  timeline: Timeline;
};

export function EventsPage() {
  usePageTitle(t`Events`);
  const archive = useSetArchive();
  const [inputText, setInputText] = useState("");
  const searchText = useDebouncedValue(
    inputText.toLowerCase(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const {
    data: timelines = [],
    isLoading,
    error,
  } = useListTimelinesQuery({ include: "events" });

  const events = useMemo(() => {
    const items: EventWithTimeline[] = timelines
      .filter((timeline) => !timeline.archived)
      .flatMap((timeline) =>
        (timeline.events ?? [])
          .filter((event) => !event.archived)
          .map((event) => ({ event, timeline })),
      );

    const filtered = searchText
      ? items.filter(({ event }) => isEventMatch(event, searchText))
      : items;

    return filtered.sort(
      (a, b) =>
        parseTimestamp(b.event.timestamp) - parseTimestamp(a.event.timestamp),
    );
  }, [timelines, searchText]);

  const handleArchive = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);

  const handleSearchChange: InputProps["onChange"] = (e) =>
    setInputText(e.target.value);

  return (
    <PageContainer gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Events`}</DataStudioBreadcrumbs>
        }
      />
      <Box w="100%" className={S.contentWrapper} px="3.5rem" pb="2rem">
        {isLoading || error ? (
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        ) : (
          <>
            <Box className={S.toolbar}>
              <TextInput
                placeholder={t`Search for an event`}
                leftSection={<Icon name="search" />}
                value={inputText}
                onChange={handleSearchChange}
              />
            </Box>
            <Card withBorder p={0} shadow="none">
              {events.length > 0 ? (
                <ListRoot
                  className={S.eventList}
                  data-testid="events-page-list"
                >
                  {events.map(({ event, timeline }) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      timeline={timeline}
                      onArchive={handleArchive}
                    />
                  ))}
                </ListRoot>
              ) : (
                <ListEmptyState
                  label={
                    searchText
                      ? t`No results for "${inputText}"`
                      : t`No events yet`
                  }
                />
              )}
            </Card>
          </>
        )}
      </Box>
    </PageContainer>
  );
}

function isEventMatch(event: TimelineEvent, searchText: string) {
  return (
    event.name.toLowerCase().includes(searchText) ||
    event.description?.toLowerCase()?.includes(searchText)
  );
}
