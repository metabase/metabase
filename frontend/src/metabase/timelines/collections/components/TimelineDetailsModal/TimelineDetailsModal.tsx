import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { getTimelineName } from "metabase/lib/timelines";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import * as Urls from "metabase/lib/urls";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import Icon from "metabase/components/Icon";
import EntityMenu from "metabase/components/EntityMenu";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import SearchEmptyState from "../SearchEmptyState";
import EventList from "../EventList";
import TimelineEmptyState from "../TimelineEmptyState";
import {
  ModalBody,
  ModalRoot,
  ModalToolbar,
  ModalToolbarInput,
  ModalToolbarLink,
} from "./TimelineDetailsModal.styled";
import { MenuItem } from "../../types";

export interface TimelineDetailsModalProps {
  timeline: Timeline;
  collection: Collection;
  isArchive?: boolean;
  isOnlyTimeline?: boolean;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
  onClose?: () => void;
  onGoBack?: (timeline: Timeline, collection: Collection) => void;
}

const TimelineDetailsModal = ({
  timeline,
  collection,
  isArchive = false,
  isOnlyTimeline = false,
  onArchive,
  onUnarchive,
  onClose,
  onGoBack,
}: TimelineDetailsModalProps): JSX.Element => {
  const title = isArchive ? t`Archived events` : getTimelineName(timeline);
  const [inputText, setInputText] = useState("");

  const searchText = useDebouncedValue(
    inputText.toLowerCase(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const events = useMemo(() => {
    return getEvents(timeline.events, searchText, isArchive);
  }, [timeline, searchText, isArchive]);

  const menuItems = useMemo(() => {
    return getMenuItems(timeline, collection, isArchive, isOnlyTimeline);
  }, [timeline, collection, isArchive, isOnlyTimeline]);

  const handleGoBack = useCallback(() => {
    onGoBack?.(timeline, collection);
  }, [timeline, collection, onGoBack]);

  const isNotEmpty = events.length > 0;
  const isSearching = searchText.length > 0;
  const canWrite = timeline.collection?.can_write;
  const canGoBack = isArchive || !isOnlyTimeline;

  return (
    <ModalRoot>
      <ModalHeader
        title={title}
        onClose={onClose}
        onGoBack={canGoBack ? handleGoBack : undefined}
      >
        {menuItems.length > 0 && (
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
        )}
      </ModalHeader>
      {(isNotEmpty || isSearching) && (
        <ModalToolbar>
          <ModalToolbarInput
            value={inputText}
            placeholder={t`Search for an event`}
            icon={<Icon name="search" />}
            onChange={setInputText}
          />
          {canWrite && !isArchive && (
            <ModalToolbarLink
              className="Button"
              to={Urls.newEventInCollection(timeline, collection)}
            >{t`Add an event`}</ModalToolbarLink>
          )}
        </ModalToolbar>
      )}
      <ModalBody isTopAligned={isNotEmpty}>
        {isNotEmpty ? (
          <EventList
            events={events}
            timeline={timeline}
            collection={collection}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        ) : isArchive || isSearching ? (
          <SearchEmptyState />
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

const getMenuItems = (
  timeline: Timeline,
  collection: Collection,
  isArchive: boolean,
  isOnlyTimeline: boolean,
) => {
  const items: MenuItem[] = [];

  if (timeline.collection?.can_write && !isArchive) {
    items.push(
      {
        title: t`New timeline`,
        link: Urls.newTimelineInCollection(collection),
      },
      {
        title: t`Edit timeline details`,
        link: Urls.editTimelineInCollection(timeline, collection),
      },
    );
  }

  if (!isArchive) {
    items.push({
      title: t`View archived events`,
      link: Urls.timelineArchiveInCollection(timeline, collection),
    });
  }

  if (isOnlyTimeline) {
    items.push({
      title: t`View archived timelines`,
      link: Urls.timelinesArchiveInCollection(collection),
    });
  }

  return items;
};

export default TimelineDetailsModal;
