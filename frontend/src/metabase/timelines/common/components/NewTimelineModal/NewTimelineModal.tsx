import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import { canonicalCollectionId } from "metabase/collections/utils";
import { Collection, TimelineData } from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";
import TimelineForm from "../TimelineForm";

export interface NewTimelineModalProps {
  collection: Collection;
  onSubmit: (values: TimelineData, collection: Collection) => void;
  onSubmitSuccess?: () => void;
  onCancel: () => void;
  onClose?: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return getInitialValues(collection);
  }, [collection]);

  const handleSubmit = useCallback(
    async (values: TimelineData) => {
      await onSubmit(values, collection);
      onSubmitSuccess?.();
    },
    [collection, onSubmit, onSubmitSuccess],
  );

  return (
    <div>
      <ModalHeader title={t`New event timeline`} onClose={onClose} />
      <ModalBody>
        <TimelineForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

const getInitialValues = (collection: Collection): TimelineData => ({
  name: "",
  description: null,
  collection_id: canonicalCollectionId(collection.id),
  icon: getDefaultTimelineIcon(),
  default: false,
  archived: false,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewTimelineModal;
