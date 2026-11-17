import { type ChangeEventHandler, type JSX, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { TimelineModalScrollArea } from "metabase/timelines/common/components/TimelineModal";
import { Button, Flex, Icon, TextInput } from "metabase/ui";
import * as Urls from "metabase/urls";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import EventList from "../EventList";
import SearchEmptyState from "../SearchEmptyState";
import TimelineEmptyState from "../TimelineEmptyState";

export interface TimelineDetailsContentProps {
  timeline: Timeline;
  isArchive?: boolean;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const TimelineDetailsContent = ({
  timeline,
  isArchive = false,
  onArchive,
  onUnarchive,
}: TimelineDetailsContentProps): JSX.Element => {
  const [inputText, setInputText] = useState("");

  const searchText = useDebouncedValue(
    inputText.toLowerCase(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const events = useMemo(() => {
    return getEvents(timeline.events, searchText, isArchive);
  }, [timeline, searchText, isArchive]);

  const isNotEmpty = events.length > 0;
  const isSearching = searchText.length > 0;
  const canWrite = timeline.collection?.can_write;

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setInputText(e.target.value);

  return (
    <>
      {(isNotEmpty || isSearching) && (
        <Flex gap="lg" mb="lg">
          <TextInput
            flex="1 1 auto"
            value={inputText}
            placeholder={t`Search for an event`}
            leftSection={<Icon name="search" />}
            onChange={handleSearchChange}
          />
          {canWrite && !isArchive && (
            <Button
              size="lg"
              component={ForwardRefLink}
              to={Urls.newEventInCollection(timeline)}
              role="button"
              flex="0 0 auto"
            >{t`Create event`}</Button>
          )}
        </Flex>
      )}
      <TimelineModalScrollArea justify={isNotEmpty ? undefined : "center"}>
        {match({ isNotEmpty, isFiltered: isArchive || isSearching })
          .with({ isNotEmpty: true }, () => (
            <EventList
              events={events}
              timeline={timeline}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
            />
          ))
          .with({ isFiltered: true }, () => <SearchEmptyState />)
          .otherwise(() => (
            <TimelineEmptyState timeline={timeline} />
          ))}
      </TimelineModalScrollArea>
    </>
  );
};

const getEvents = (
  events: TimelineEvent[] = [],
  searchText: string,
  isArchive: boolean,
) => {
  const chain = searchText
    ? _.chain(events).filter((e) => isEventMatch(e, searchText))
    : _.chain(events);

  return chain
    .filter((e) => e.archived === isArchive)
    .sortBy((e) => parseTimestamp(e.timestamp))
    .reverse()
    .value();
};

const isEventMatch = (event: TimelineEvent, searchText: string) => {
  return (
    event.name.toLowerCase().includes(searchText) ||
    event.description?.toLowerCase()?.includes(searchText)
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsContent;
