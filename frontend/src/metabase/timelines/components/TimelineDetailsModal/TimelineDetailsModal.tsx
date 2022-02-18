import React from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { parseTimestamp } from "metabase/lib/time";
import Link from "metabase/core/components/Link";
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
} from "./TimelineDetailsModal.styled";

export interface TimelineDetailsModalProps {
  timeline: Timeline;
  collection: Collection;
  archived?: boolean;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
  onClose?: () => void;
}

const TimelineDetailsModal = ({
  timeline,
  collection,
  archived = false,
  onArchive,
  onUnarchive,
  onClose,
}: TimelineDetailsModalProps): JSX.Element => {
  const title = archived ? t`Archived events` : timeline.name;
  const events = getEvents(timeline.events, archived);
  const hasEvents = events.length > 0;
  const menuItems = getMenuItems(timeline, collection);

  return (
    <ModalRoot>
      <ModalHeader title={title} onClose={onClose}>
        {!archived && <EntityMenu items={menuItems} triggerIcon="kebab" />}
      </ModalHeader>
      {hasEvents && (
        <ModalToolbar>
          {!archived && (
            <Link
              className="Button"
              to={Urls.newEventInCollection(timeline, collection)}
            >{t`Add an event`}</Link>
          )}
        </ModalToolbar>
      )}
      <ModalBody>
        {hasEvents ? (
          <EventList
            events={events}
            timeline={timeline}
            collection={collection}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        ) : archived ? (
          <EventEmptyState />
        ) : (
          <TimelineEmptyState timeline={timeline} collection={collection} />
        )}
      </ModalBody>
    </ModalRoot>
  );
};

const getEvents = (events: TimelineEvent[] = [], archived: boolean) => {
  return _.chain(events)
    .filter(e => e.archived === archived)
    .sortBy(e => parseTimestamp(e.timestamp))
    .reverse()
    .value();
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
