import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import SearchEmptyState from "../SearchEmptyState";
import TimelineList from "../TimelineList";
import TimelineEmptyState from "../TimelineEmptyState";
import { ModalBody, ModalRoot } from "./TimelineListModal.styled";

export interface TimelineListModalProps {
  timelines: Timeline[];
  collection: Collection;
  isArchive?: boolean;
  onUnarchive?: (timeline: Timeline) => void;
  onClose?: () => void;
  onGoBack?: (collection: Collection) => void;
}

const TimelineListModal = ({
  timelines,
  collection,
  isArchive = false,
  onUnarchive,
  onClose,
  onGoBack,
}: TimelineListModalProps): JSX.Element => {
  const title = getTitle(timelines, collection, isArchive);
  const menuItems = getMenuItems(timelines, collection, isArchive);
  const sortedTimelines = getSortedTimelines(timelines);
  const hasTimelines = timelines.length > 0;
  const hasMenuItems = menuItems.length > 0;

  const handleGoBack = useCallback(() => {
    onGoBack?.(collection);
  }, [collection, onGoBack]);

  return (
    <ModalRoot>
      <ModalHeader
        title={title}
        onClose={onClose}
        onGoBack={isArchive ? handleGoBack : undefined}
      >
        {hasMenuItems && (
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
        )}
      </ModalHeader>
      <ModalBody isTopAligned={hasTimelines}>
        {hasTimelines ? (
          <TimelineList
            timelines={sortedTimelines}
            collection={collection}
            onUnarchive={onUnarchive}
          />
        ) : isArchive ? (
          <SearchEmptyState isTimeline={isArchive} />
        ) : (
          <TimelineEmptyState collection={collection} />
        )}
      </ModalBody>
    </ModalRoot>
  );
};

const getTitle = (
  timelines: Timeline[],
  collection: Collection,
  isArchive: boolean,
) => {
  if (isArchive) {
    return t`Archived timelines`;
  } else if (timelines.length) {
    return t`Events`;
  } else {
    return t`${collection.name} events`;
  }
};

const getMenuItems = (
  timelines: Timeline[],
  collection: Collection,
  isArchive: boolean,
) => {
  if (!collection.can_write || isArchive) {
    return [];
  }

  return [
    {
      title: t`New timeline`,
      link: Urls.newTimelineInCollection(collection),
    },
    {
      title: t`View archived timelines`,
      link: Urls.timelinesArchiveInCollection(collection),
    },
  ];
};

const getSortedTimelines = (timelines: Timeline[]) => {
  return _.chain(timelines)
    .sortBy(timeline => timeline.name)
    .sortBy(timeline => timeline.collection?.personal_owner_id != null) // personal collections last
    .value();
};

export default TimelineListModal;
