import { useCallback, useState } from "react";
import { t } from "ttag";
import { getTimelineName } from "metabase/lib/timelines";
import Button from "metabase/core/components/Button/Button";
import CollectionPicker from "metabase/containers/CollectionPicker";
import { Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import ModalFooter from "../ModalFooter";
import { ModalBody, ModalRoot } from "./MoveTimelineModal.styled";

export interface MoveTimelineModalProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline, collectionId: number | null) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const MoveTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: MoveTimelineModalProps): JSX.Element => {
  const [collectionId, setCollectionId] = useState(timeline.collection_id);
  const isEnabled = timeline.collection_id !== collectionId;

  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline, collectionId);
    onSubmitSuccess?.();
  }, [timeline, collectionId, onSubmit, onSubmitSuccess]);

  return (
    <ModalRoot>
      <ModalHeader
        title={t`Move ${getTimelineName(timeline)}`}
        onClose={onClose}
      />
      <ModalBody>
        <CollectionPicker
          value={collectionId}
          showScroll={false}
          onChange={setCollectionId}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary disabled={!isEnabled} onClick={handleSubmit}>
          {t`Move`}
        </Button>
      </ModalFooter>
    </ModalRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveTimelineModal;
