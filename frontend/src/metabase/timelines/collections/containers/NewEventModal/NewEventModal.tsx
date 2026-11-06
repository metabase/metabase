import { t } from "ttag";

import {
  skipToken,
  useCreateTimelineEventMutation,
  useGetTimelineQuery,
} from "metabase/api";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useNavigate } from "metabase/router";
import NewEventForm from "metabase/timelines/common/components/NewEventForm";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";
import type {
  CreateTimelineEventRequest,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

function NewEventModalContainer({ params, onClose }: ModalComponentProps) {
  const navigate = useNavigate();
  const [createTimelineEvent] = useCreateTimelineEventMutation();
  const id = Urls.extractEntityId(params.timelineId);
  const {
    data: timeline,
    isLoading,
    error,
  } = useGetTimelineQuery(id != null ? { id, include: "events" } : skipToken);

  const onSubmit = async (
    values: Partial<TimelineEvent>,
    _collection?: unknown,
    timeline?: Timeline,
  ) => {
    // Unjustified type cast. FIXME
    await createTimelineEvent(values as CreateTimelineEventRequest).unwrap();
    if (timeline) {
      navigate(Urls.timelineInCollection(timeline));
    }
  };

  return (
    <TimelineModal
      title={t`New event`}
      onClose={onClose}
      animated={false}
      density="relaxed"
      tall={isLoading || !!error || !timeline}
    >
      {isLoading || error || !timeline ? (
        <TimelineModalLoadingState loading={isLoading} error={error} />
      ) : (
        <NewEventForm
          source="collections"
          timelines={[timeline]}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </TimelineModal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewEventModalContainer;
