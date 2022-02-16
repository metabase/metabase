import React, { useMemo } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import TimelineCard from "../TimelineCard";
import {
  EmptyStateBody,
  EmptyStateRoot,
  EmptyStateText,
  ListRoot,
  ModalBody,
} from "./TimelineListModal.styled";

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
  const hasItems = timelines.length > 0;
  const title = hasItems ? t`Events` : t`${collection.name} events`;

  return (
    <div>
      <ModalHeader title={title} onClose={onClose}>
        {hasItems && <TimelineMenu collection={collection} />}
      </ModalHeader>
      <ModalBody>
        {hasItems ? (
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

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
};

export interface TimelineEmptyStateProps {
  collection: Collection;
}

const TimelineEmptyState = ({
  collection,
}: TimelineEmptyStateProps): JSX.Element => {
  const link = Urls.newEventAndTimelineInCollection(collection);

  return (
    <EmptyStateRoot>
      <EmptyStateBody>
        <EmptyStateText>
          {t`Add events to Metabase to open important milestones, launches, or anything else, right alongside your data.`}
        </EmptyStateText>
        <Link className="Button Button--primary" to={link}>
          {t`Add an event`}
        </Link>
      </EmptyStateBody>
    </EmptyStateRoot>
  );
};

export default TimelineListModal;
