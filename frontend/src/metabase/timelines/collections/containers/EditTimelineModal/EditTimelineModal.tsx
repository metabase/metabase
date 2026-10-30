import { t } from "ttag";

import {
  skipToken,
  useGetTimelineQuery,
  useUpdateTimelineMutation,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import EditTimelineForm from "metabase/timelines/common/components/EditTimelineForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type { Timeline } from "metabase-types/api";

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

  const handleSubmit = async (timeline: Timeline) => {
    await updateTimeline(timeline).unwrap();
    navigate(Urls.timelineInCollection(timeline));
  };

  const handleArchive = async (timeline: Timeline) => {
    await archive({ id: timeline.id, model: "timeline" }, true);
    navigate(Urls.timelinesInCollection(timeline.collection));
  };

  return (
    <TimelineModal
      title={t`Edit event timeline`}
      onClose={onClose}
      animated={false}
      density="relaxed"
      tall={isLoading || !!error || !timeline}
    >
      {isLoading || error || !timeline ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <EditTimelineForm
          timeline={timeline}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditTimelineModalContainer;
