import { push } from "react-router-redux";

import {
  skipToken,
  useGetTimelineQuery,
  useUpdateTimelineMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import EditTimelineModal from "metabase/timelines/common/components/EditTimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";

function EditTimelineModalContainer({ params, ...props }: ModalComponentProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const [updateTimeline] = useUpdateTimelineMutation();
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
    await updateTimeline(timeline).unwrap();
    dispatch(push(Urls.timelineInCollection(timeline)));
  };

  const handleArchive = async (timeline: Timeline) => {
    await archive({ id: timeline.id, model: "timeline" }, true);
    dispatch(push(Urls.timelinesInCollection(timeline.collection)));
  };

  return (
    <EditTimelineModal
      {...props}
      timeline={timeline}
      onSubmit={handleSubmit}
      onArchive={handleArchive}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditTimelineModalContainer;
