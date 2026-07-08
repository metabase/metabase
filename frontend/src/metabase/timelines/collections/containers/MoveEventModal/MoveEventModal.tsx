import { push } from "react-router-redux";

import {
  skipToken,
  useGetCollectionQuery,
  useGetTimelineEventQuery,
  useListTimelinesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/redux";
import MoveEventModal, {
  type MoveEventModalProps,
} from "metabase/timelines/common/components/MoveEventModal";
import { useSetTimeline } from "metabase/timelines/common/hooks";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface OwnProps {
  params: ModalParams;
  onClose?: () => void;
}

type ContainerProps = Omit<
  MoveEventModalProps,
  "event" | "timelines" | "collection" | "onSubmit"
> &
  OwnProps;

function MoveEventModalContainer({ params, ...props }: ContainerProps) {
  const setTimeline = useSetTimeline();
  const dispatch = useDispatch();
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
      dispatch(push(Urls.timelineInCollection(oldTimeline)));
    }
  };

  const isLoading = isEventLoading || isTimelinesLoading || isCollectionLoading;
  const error = eventError ?? timelinesError ?? collectionError;

  if (isLoading || error || !event) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <MoveEventModal
      {...props}
      event={event}
      timelines={timelines}
      collection={collection}
      onSubmit={handleSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveEventModalContainer;
