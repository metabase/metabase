import { push } from "react-router-redux";

import {
  skipToken,
  useDeleteTimelineMutation,
  useGetTimelineQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import DeleteTimelineModal from "metabase/timelines/common/components/DeleteTimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

function DeleteTimelineModalContainer({
  params,
  ...props
}: ModalComponentProps) {
  const dispatch = useDispatch();
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
    dispatch(push(Urls.timelinesArchiveInCollection(timeline.collection)));
  };

  return (
    <DeleteTimelineModal
      {...props}
      timeline={timeline}
      onSubmit={handleSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineModalContainer;
