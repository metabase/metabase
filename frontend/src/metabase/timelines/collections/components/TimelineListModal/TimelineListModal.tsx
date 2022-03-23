import React from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import TimelineCard from "../TimelineCard";
import TimelineEmptyState from "../TimelineEmptyState";
import { ListRoot, ModalBody, ModalRoot } from "./TimelineListModal.styled";

export interface TimelineListModalProps {
  timelines: Timeline[];
  collection: Collection;
  isArchive?: boolean;
  onClose?: () => void;
}

const TimelineListModal = ({
  timelines,
  collection,
  isArchive = false,
  onClose,
}: TimelineListModalProps): JSX.Element => {
  const hasTimelines = timelines.length > 0;
  const title = hasTimelines ? t`Events` : t`${collection.name} events`;
  const menuItems = getMenuItems(timelines, collection, isArchive);
  const sortedTimelines = getSortedTimelines(timelines);

  return (
    <ModalRoot>
      <ModalHeader title={title} onClose={onClose}>
        {menuItems.length > 0 && (
          <EntityMenu items={menuItems} triggerIcon="ellipsis" />
        )}
      </ModalHeader>
      <ModalBody>
        {hasTimelines ? (
          <ListRoot>
            {sortedTimelines.map(timeline => (
              <TimelineCard
                key={timeline.id}
                timeline={timeline}
                collection={collection}
              />
            ))}
          </ListRoot>
        ) : (
          <TimelineEmptyState collection={collection} />
        )}
      </ModalBody>
    </ModalRoot>
  );
};

const getMenuItems = (
  timelines: Timeline[],
  collection: Collection,
  isArchive: boolean,
) => {
  if (!collection.can_write || !timelines.length || isArchive) {
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
  return _.sortBy(timelines, timeline => timeline.name);
};

export default TimelineListModal;
