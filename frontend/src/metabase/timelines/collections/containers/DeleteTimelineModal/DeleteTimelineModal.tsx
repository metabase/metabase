import {
  skipToken,
  useDeleteTimelineMutation,
  useGetTimelineQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import DeleteTimelineModal from "metabase/timelines/common/components/DeleteTimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

function DeleteTimelineModalContainer({
  params,
  onClose,
  ...props
}: ModalComponentProps) {
  const [deleteTimeline] = useDeleteTimelineMutation();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

  if (isLoading || error || !timeline) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  const handleSubmit = async (timeline: Timeline) => {
    await deleteTimeline(timeline.id).unwrap();
    onClose();
  };

  return (
    <DeleteTimelineModal
      {...props}
      onClose={onClose}
      timeline={timeline}
      onSubmit={handleSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineModalContainer;
