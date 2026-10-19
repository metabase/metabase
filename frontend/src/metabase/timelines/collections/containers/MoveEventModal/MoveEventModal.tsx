import {
  skipToken,
  useGetCollectionQuery,
  useGetTimelineEventQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { useNavigate } from "metabase/router";
import {
  MoveEventModal,
  type MoveEventModalProps,
} from "metabase/timelines/common/components/MoveEventModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { LoadingAndErrorModal } from "../../components/LoadingAndErrorModal";
import type { ModalParams } from "../../types";

interface OwnProps {
  params: ModalParams;
}

type ContainerProps = Omit<
  MoveEventModalProps,
  "event" | "timelines" | "collection" | "onSubmit" | "animated"
> &
  OwnProps;

function MoveEventModalContainer({
  params,
  onClose,
  ...props
}: ContainerProps) {
  const setTimeline = useSetTimeline();
  const navigate = useNavigate();
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: event,
    isLoading: isEventLoading,
    error: eventError,
  } = useGetTimelineEventQuery(eventId ?? skipToken);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });
  const {
    data: collection,
    isLoading: isCollectionLoading,
    error: collectionError,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const handleSubmit = async (
    event: TimelineEvent,
    newTimeline?: Timeline,
    oldTimeline?: Timeline,
  ) => {
    if (newTimeline) {
      await setTimeline(event, newTimeline);
    }
    if (oldTimeline) {
      navigate(Urls.timelineInCollection(oldTimeline));
    }
  };

  const isLoading = isEventLoading || isTimelinesLoading || isCollectionLoading;
  const error = eventError ?? timelinesError ?? collectionError;

  if (isLoading || error || !event) {
    return (
      <LoadingAndErrorModal
        loading={isLoading}
        error={error}
        onClose={onClose}
      />
    );
  }

  return (
    <MoveEventModal
      {...props}
      event={event}
      timelines={timelines}
      collection={collection}
      onSubmit={handleSubmit}
      onClose={onClose}
      animated={false}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModalContainer;
