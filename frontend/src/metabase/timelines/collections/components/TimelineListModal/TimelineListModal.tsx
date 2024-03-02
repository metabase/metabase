import { useCallback, useMemo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import {
  getDefaultTimelineName,
  getSortedTimelines,
} from "metabase/lib/timelines";
import * as Urls from "metabase/lib/urls";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import type { Collection, Timeline } from "metabase-types/api";

import SearchEmptyState from "../SearchEmptyState";
import TimelineEmptyState from "../TimelineEmptyState";
import TimelineList from "../TimelineList";

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
  const hasTimelines = timelines.length > 0;
  const hasMenuItems = menuItems.length > 0;

  const sortedTimelines = useMemo(() => {
    return getSortedTimelines(timelines, collection);
  }, [timelines, collection]);

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
          <TimelineList timelines={sortedTimelines} onUnarchive={onUnarchive} />
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
    return getDefaultTimelineName(collection);
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListModal;
