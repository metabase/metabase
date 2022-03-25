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
  onClose?: () => void;
}

const TimelineListModal = ({
  timelines,
  collection,
  onClose,
}: TimelineListModalProps): JSX.Element => {
  const hasTimelines = timelines.length > 0;
  const title = hasTimelines ? t`Events` : t`${collection.name} events`;
  const menuItems = getMenuItems(timelines, collection);
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

const getMenuItems = (timelines: Timeline[], collection: Collection) => {
  if (!collection.can_write || !timelines.length) {
    return [];
  }

  return [
    {
      title: t`New timeline`,
      link: Urls.newTimelineInCollection(collection),
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
