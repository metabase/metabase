import {
  skipToken,
  useGetTimelineQuery,
  useUpdateTimelineMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import EditTimelineModal from "metabase/timelines/common/components/EditTimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";

function EditTimelineModalContainer({ params, onClose }: ModalComponentProps) {
  const navigate = useNavigate();
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
      <LoadingAndErrorModal
        loading={isLoading}
        error={error}
        onClose={onClose}
      />
    );
  }

  const handleSubmit = async (timeline: Timeline) => {
    await updateTimeline(timeline).unwrap();
    navigate(Urls.timelineInCollection(timeline));
  };

  const handleArchive = async (timeline: Timeline) => {
    await archive({ id: timeline.id, model: "timeline" }, true);
    navigate(Urls.timelinesInCollection(timeline.collection));
  };

  return (
    <EditTimelineModal
      timeline={timeline}
      onSubmit={handleSubmit}
      onArchive={handleArchive}
      onClose={onClose}
      animated={false}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditTimelineModalContainer;
