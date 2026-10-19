import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/common/collections/utils";
import { getDefaultTimelineIcon } from "metabase/common/utils/timelines";
import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Modal } from "metabase/ui";
import type { Collection, TimelineData } from "metabase-types/api";

import { TimelineForm } from "../TimelineForm";

export interface NewTimelineModalProps extends TimelineModalTransitionProps {
  collection: Collection;
  onSubmit: (values: TimelineData, collection: Collection) => void;
  onSubmitSuccess?: () => void;
  onClose: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onSubmitSuccess,
  onClose,
  animated,
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
    <Modal
      opened
      size="lg"
      density="relaxed"
      title={t`New event timeline`}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <TimelineForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
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
