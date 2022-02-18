import React, { useMemo } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import TimelineCard from "../TimelineCard";
import TimelineEmptyState from "../TimelineEmptyState";
import { ListRoot, ModalBody } from "./TimelineListModal.styled";

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

  return (
    <div>
      <ModalHeader title={title} onClose={onClose}>
        {hasTimelines && <TimelineMenu collection={collection} />}
      </ModalHeader>
      <ModalBody>
        {hasTimelines ? (
          <TimelineList timelines={timelines} collection={collection} />
        ) : (
          <TimelineEmptyState collection={collection} />
        )}
      </ModalBody>
    </div>
  );
};

interface TimelineListProps {
  timelines: Timeline[];
  collection: Collection;
}

const TimelineList = ({
  timelines,
  collection,
}: TimelineListProps): JSX.Element => {
  return (
    <ListRoot>
      {timelines.map(timeline => (
        <TimelineCard
          key={timeline.id}
          timeline={timeline}
          collection={collection}
        />
      ))}
    </ListRoot>
  );
};

export interface TimelineMenuProps {
  collection: Collection;
}

const TimelineMenu = ({ collection }: TimelineMenuProps): JSX.Element => {
  const items = useMemo(
    () => [
      {
        title: t`New timeline`,
        link: Urls.newTimelineInCollection(collection),
      },
    ],
    [collection],
  );

  return <EntityMenu items={items} triggerIcon="kebab" />;
};

export default TimelineListModal;
