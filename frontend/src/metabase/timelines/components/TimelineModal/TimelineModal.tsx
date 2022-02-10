import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalToolbar } from "./TimelineModal.styled";

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
  return (
    <div>
      <ModalHeader title={timeline.name} onClose={onClose} />
      <ModalBody>
        <ModalToolbar>
          <Link
            className="Button"
            to={Urls.newEventInCollection(timeline, collection)}
          >{t`Add an event`}</Link>
        </ModalToolbar>
      </ModalBody>
    </div>
  );
};

export default TimelineModal;
