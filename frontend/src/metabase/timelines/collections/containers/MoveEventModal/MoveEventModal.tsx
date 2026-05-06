import { push } from "react-router-redux";
import _ from "underscore";

import { skipToken, useGetTimelineEventQuery } from "metabase/api";
import { Collections } from "metabase/entities/collections";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
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
}

const timelinesProps = {
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: OwnProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

type ContainerProps = Omit<MoveEventModalProps, "event" | "onSubmit"> & {
  params: ModalParams;
};

function MoveEventModalContainer({ params, ...props }: ContainerProps) {
  const setTimeline = useSetTimeline();
  const dispatch = useDispatch();
  const eventId = Urls.extractEntityId(params.timelineEventId);
  const {
    data: event,
    isLoading,
    error,
  } = useGetTimelineEventQuery(eventId ?? skipToken);

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

  if (isLoading || error || !event) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <MoveEventModal {...props} event={event} onSubmit={handleSubmit} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  Collections.load(collectionProps),
)(MoveEventModalContainer);
