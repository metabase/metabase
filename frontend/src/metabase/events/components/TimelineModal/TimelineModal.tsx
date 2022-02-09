import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, EventTimeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";

export interface TimelineModalProps {
  timeline: EventTimeline;
  collection: Collection;
  onClose: () => void;
}

const TimelineModal = ({
  timeline,
  collection,
  onClose,
}: TimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={timeline.name} onClose={onClose}>
        <TimelineMenu timeline={timeline} collection={collection} />
      </ModalHeader>
    </div>
  );
};

export interface TimelineMenuProps {
  timeline: EventTimeline;
  collection: Collection;
}

const TimelineMenu = ({
  timeline,
  collection,
}: TimelineMenuProps): JSX.Element => {
  const items = [
    {
      title: t`New timeline`,
      link: Urls.newTimeline(collection),
    },
    {
      title: t`Edit timeline details`,
      link: Urls.editTimeline(collection, timeline.id),
    },
  ];

  return <EntityMenu items={items} triggerIcon="ellipsis" />;
};

export default TimelineModal;
