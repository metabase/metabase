import React, { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import * as Urls from "metabase/lib/urls";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import Icon from "metabase/components/Icon";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import EventEmptyState from "../EventEmptyState";
import EventList from "../EventList";
import ModalHeader from "../ModalHeader";
import TimelineEmptyState from "../TimelineEmptyState";
import {
  ModalBody,
  ModalRoot,
  ModalToolbar,
  ModalToolbarInput,
  ModalToolbarLink,
} from "./TimelineDetailsModal.styled";

export interface TimelineDetailsModalProps {
  timeline: Timeline;
  collection: Collection;
  isArchive?: boolean;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
  onClose?: () => void;
}

const TimelineDetailsModal = ({
  timeline,
  collection,
  isArchive = false,
  onArchive,
  onUnarchive,
  onClose,
}: TimelineDetailsModalProps): JSX.Element => {
  const title = isArchive ? t`Archived events` : timeline.name;
  const [inputText, setInputText] = useState("");

  const searchText = useDebouncedValue(
    inputText.toLowerCase(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const events = useMemo(() => {
    return getEvents(timeline.events, searchText, isArchive);
  }, [timeline, searchText, isArchive]);

  const menuItems = useMemo(() => {
    return getMenuItems(timeline, collection);
  }, [timeline, collection]);

  const isNotEmpty = events.length > 0;
  const isSearching = searchText.length > 0;

  return (
    <ModalRoot>
      <ModalHeader title={title} onClose={onClose}>
        {!isArchive && <EntityMenu items={menuItems} triggerIcon="kebab" />}
      </ModalHeader>
      {(isNotEmpty || isSearching) && (
        <ModalToolbar>
          <ModalToolbarInput
            value={inputText}
            placeholder={t`Search for an event`}
            icon={<Icon name="search" />}
            onChange={setInputText}
          />
          {!isArchive && (
            <ModalToolbarLink
              className="Button"
              to={Urls.newEventInCollection(timeline, collection)}
            >{t`Add an event`}</ModalToolbarLink>
          )}
        </ModalToolbar>
      )}
      <ModalBody>
        {isNotEmpty ? (
          <EventList
            events={events}
            timeline={timeline}
            collection={collection}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        ) : isArchive || isSearching ? (
          <EventEmptyState />
        ) : (
          <TimelineEmptyState timeline={timeline} collection={collection} />
        )}
      </ModalBody>
    </ModalRoot>
  );
};

const getEvents = (
  events: TimelineEvent[] = [],
  searchText: string,
  isArchive: boolean,
) => {
  const chain = searchText
    ? _.chain(events).filter(e => isEventMatch(e, searchText))
    : _.chain(events);

  return chain
    .filter(e => e.archived === isArchive)
    .sortBy(e => parseTimestamp(e.timestamp))
    .reverse()
    .value();
};

const isEventMatch = (event: TimelineEvent, searchText: string) => {
  return (
    event.name.toLowerCase().includes(searchText) ||
    event.description?.toLowerCase()?.includes(searchText)
  );
};

const getMenuItems = (timeline: Timeline, collection: Collection) => {
  return [
    {
      title: t`New timeline`,
      link: Urls.newTimelineInCollection(collection),
    },
    {
      title: t`Edit timeline details`,
      link: Urls.editTimelineInCollection(timeline, collection),
    },
    {
      title: t`View archived events`,
      link: Urls.timelineArchiveInCollection(timeline, collection),
    },
  ];
};

export default TimelineDetailsModal;
