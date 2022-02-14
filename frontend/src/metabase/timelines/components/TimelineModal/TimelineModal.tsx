import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import { Collection, Timeline } from "metabase-types/api";
import EventList from "../EventList";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalRoot, ModalToolbar } from "./TimelineModal.styled";

export interface TimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onClose?: () => void;
}

const TimelineModal = ({
  timeline,
  collection,
  onClose,
}: TimelineModalProps): JSX.Element => {
  const menuItems = getMenuItems(timeline, collection);

  return (
    <ModalRoot>
      <ModalHeader title={timeline.name} onClose={onClose}>
        <EntityMenu items={menuItems} triggerIcon="ellipses" />
      </ModalHeader>
      <ModalToolbar>
        <Link
          className="Button"
          to={Urls.newEventInCollection(timeline, collection)}
        >{t`Add an event`}</Link>
      </ModalToolbar>
      <ModalBody>
        <EventList timeline={timeline} collection={collection} />
      </ModalBody>
    </ModalRoot>
  );
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
  ];
};

export default TimelineModal;
