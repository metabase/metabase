import { t } from "ttag";

import {
  skipToken,
  useDeleteTimelineMutation,
  useGetTimelineQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import DeleteTimelineModal from "metabase/timelines/common/components/DeleteTimelineModal";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

function DeleteTimelineModalContainer({
  params,
  onClose,
}: ModalComponentProps) {
  const [deleteTimeline] = useDeleteTimelineMutation();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

  const handleSubmit = async (timeline: Timeline) => {
    await deleteTimeline(timeline.id).unwrap();
    onClose();
  };

  return (
    <TimelineModal
      title={timeline ? t`Delete ${timeline.name}?` : undefined}
      onClose={onClose}
      animated={false}
      tall={isLoading || !!error || !timeline}
    >
      {isLoading || error || !timeline ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <DeleteTimelineModal
          timeline={timeline}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineModalContainer;
