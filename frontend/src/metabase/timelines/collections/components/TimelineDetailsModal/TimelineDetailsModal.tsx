import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EntityMenu from "metabase/components/EntityMenu";
import type { InputProps } from "metabase/core/components/Input";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { parseTimestamp } from "metabase/lib/time";
import { getTimelineName } from "metabase/lib/timelines";
import * as Urls from "metabase/lib/urls";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import type { MenuItem } from "../../types";
import EventList from "../EventList";
import SearchEmptyState from "../SearchEmptyState";
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
  isArchive?: boolean;
  isOnlyTimeline?: boolean;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
  onClose?: () => void;
  onGoBack?: (timeline: Timeline) => void;
}

const TimelineDetailsModal = ({
  timeline,
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
    return getMenuItems(timeline, isArchive, isOnlyTimeline);
  }, [timeline, isArchive, isOnlyTimeline]);

  const handleGoBack = useCallback(() => {
    onGoBack?.(timeline);
  }, [timeline, onGoBack]);

  const isNotEmpty = events.length > 0;
  const isSearching = searchText.length > 0;
  const canWrite = timeline.collection?.can_write;
  const canGoBack = isArchive || !isOnlyTimeline;

  const handleSearchChange: InputProps["onChange"] = e =>
    setInputText(e.target.value);

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
            fullWidth
            value={inputText}
            placeholder={t`Search for an event`}
            leftIcon="search"
            onChange={handleSearchChange}
          />
          {canWrite && !isArchive && (
            <ModalToolbarLink
              className={ButtonsS.Button}
              to={Urls.newEventInCollection(timeline)}
            >{t`Add an event`}</ModalToolbarLink>
          )}
        </ModalToolbar>
      )}
      <ModalBody isTopAligned={isNotEmpty}>
        {isNotEmpty ? (
          <EventList
            events={events}
            timeline={timeline}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        ) : isArchive || isSearching ? (
          <SearchEmptyState />
        ) : (
          <TimelineEmptyState timeline={timeline} />
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
  isArchive: boolean,
  isOnlyTimeline: boolean,
) => {
  const items: MenuItem[] = [];

  if (timeline.collection?.can_write && !isArchive) {
    items.push(
      {
        title: t`New timeline`,
        link: Urls.newTimelineInCollection(timeline.collection),
      },
      {
        title: t`Edit timeline details`,
        link: Urls.editTimelineInCollection(timeline),
      },
      {
        title: t`Move timeline`,
        link: Urls.moveTimelineInCollection(timeline),
      },
    );
  }

  if (!isArchive) {
    items.push({
      title: t`View archived events`,
      link: Urls.timelineArchiveInCollection(timeline),
    });
  }

  if (isOnlyTimeline) {
    items.push({
      title: t`View archived timelines`,
      link: Urls.timelinesArchiveInCollection(timeline.collection),
    });
  }

  return items;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsModal;
