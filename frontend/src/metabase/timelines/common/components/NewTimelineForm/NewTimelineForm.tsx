import { type JSX, useCallback, useMemo } from "react";

import { canonicalCollectionId } from "metabase/common/collections/utils";
import { getDefaultTimelineIcon } from "metabase/common/utils/timelines";
import type { Collection, TimelineData } from "metabase-types/api";

import { TimelineForm } from "../TimelineForm";

export interface NewTimelineFormProps {
  collection: Collection;
  onSubmit: (values: TimelineData, collection: Collection) => void;
  onSubmitSuccess?: () => void;
  onCancel: () => void;
}

const NewTimelineForm = ({
  collection,
  onSubmit,
  onSubmitSuccess,
  onCancel,
}: NewTimelineFormProps): JSX.Element => {
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
    <TimelineForm
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
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
export default NewTimelineForm;
