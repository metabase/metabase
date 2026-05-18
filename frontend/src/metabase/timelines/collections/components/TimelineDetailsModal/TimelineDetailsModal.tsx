import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { InputProps } from "metabase/common/components/Input";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getTimelineName } from "metabase/common/utils/timelines";
import ButtonsS from "metabase/css/components/buttons.module.css";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type { Timeline, TimelineEvent } from "metabase-types/api";

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

  const handleSearchChange: InputProps["onChange"] = (e) =>
    setInputText(e.target.value);

  return (
    <ModalRoot>
      <ModalHeader
        title={title}
        onClose={onClose}
        onGoBack={canGoBack ? handleGoBack : undefined}
      >
        {menuItems.length > 0 && (
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Timeline menu`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>{menuItems}</Menu.Dropdown>
          </Menu>
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
              role="button"
            >{t`Create event`}</ModalToolbarLink>
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

const getMenuItems = (
  timeline: Timeline,
  isArchive: boolean,
  isOnlyTimeline: boolean,
) => {
  const items: JSX.Element[] = [];

  if (timeline.collection?.can_write && !isArchive) {
    items.push(
      <Menu.Item
        key="new-timeline"
        component={ForwardRefLink}
        to={Urls.newTimelineInCollection(timeline.collection)}
      >
        {t`New timeline`}
      </Menu.Item>,
      <Menu.Item
        key="edit-timeline-details"
        component={ForwardRefLink}
        to={Urls.editTimelineInCollection(timeline)}
      >
        {t`Edit timeline details`}
      </Menu.Item>,
      <Menu.Item
        key="move-timeline"
        component={ForwardRefLink}
        to={Urls.moveTimelineInCollection(timeline)}
      >
        {t`Move timeline`}
      </Menu.Item>,
    );
  }

  if (!isArchive) {
    items.push(
      <Menu.Item
        key="view-archived-events"
        component={ForwardRefLink}
        to={Urls.timelineArchiveInCollection(timeline)}
      >
        {t`View archived events`}
      </Menu.Item>,
    );
  }

  if (isOnlyTimeline) {
    items.push(
      <Menu.Item
        key="view-archived-timelines"
        component={ForwardRefLink}
        to={Urls.timelinesArchiveInCollection(timeline.collection)}
      >
        {t`View archived timelines`}
      </Menu.Item>,
    );
  }

  return items;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineDetailsModal;
