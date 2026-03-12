import { useCallback } from "react";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { getTimelineName } from "metabase/lib/timelines";
import type { CollectionId, Timeline } from "metabase-types/api";

export interface MoveTimelineModalProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline, collectionId: CollectionId) => void;
  onSubmitSuccess?: () => void;
  onClose: () => void;
}

const MoveTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onClose,
}: MoveTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (item: OmniPickerItem) => {
      if (item.model === "collection") {
        await onSubmit(timeline, item.id);
        onSubmitSuccess?.();
        onClose?.();
      } else {
        throw new Error("Timelines can only be moved to a collection");
      }
    },
    [timeline, onSubmit, onSubmitSuccess, onClose],
  );

  return (
    <CollectionPickerModal
      value={{ id: timeline.collection_id ?? "root", model: "collection" }}
      title={t`Move ${getTimelineName(timeline)}`}
      onClose={onClose}
      onChange={handleSubmit}
      options={{
        confirmButtonText: t`Move`,
        hasPersonalCollections: true,
        hasRootCollection: true,
        hasLibrary: false,
      }}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveTimelineModal;
