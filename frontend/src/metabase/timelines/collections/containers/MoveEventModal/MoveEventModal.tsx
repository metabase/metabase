import { push } from "react-router-redux";
import _ from "underscore";

import { Collections } from "metabase/entities/collections";
import { TimelineEvents } from "metabase/entities/timeline-events";
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

const timelineEventProps = {
  id: (state: State, props: OwnProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  LoadingAndErrorWrapper,
};

const collectionProps = {
  id: (state: State, props: OwnProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

function MoveEventModalContainer(props: Omit<MoveEventModalProps, "onSubmit">) {
  const setTimeline = useSetTimeline();
  const dispatch = useDispatch();
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
  return <MoveEventModal {...props} onSubmit={handleSubmit} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
)(MoveEventModalContainer);
