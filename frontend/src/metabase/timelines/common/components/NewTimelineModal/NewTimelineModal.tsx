import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import ModalContent from "metabase/components/ModalContent";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import type { Collection, TimelineData } from "metabase-types/api";

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
    <ModalContent title={t`New event timeline`} onClose={onClose}>
      <TimelineForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={onCancel}
      />
    </ModalContent>
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
