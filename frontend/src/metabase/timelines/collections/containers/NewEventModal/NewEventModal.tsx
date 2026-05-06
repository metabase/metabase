import { push } from "react-router-redux";
import _ from "underscore";

import { useCreateTimelineEventMutation } from "metabase/api";
import { Timelines } from "metabase/entities/timelines";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import * as Urls from "metabase/urls";
import type {
  CreateTimelineEventRequest,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface NewEventModalContainerProps {
  params: ModalParams;
  timeline: Timeline;
}

const timelineProps = {
  id: (state: State, props: NewEventModalContainerProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

function NewEventModalContainer({ timeline }: NewEventModalContainerProps) {
  const dispatch = useDispatch();
  const [createTimelineEvent] = useCreateTimelineEventMutation();

  const onSubmit = async (
    values: Partial<TimelineEvent>,
    _collection?: unknown,
    timeline?: Timeline,
  ) => {
    await createTimelineEvent(values as CreateTimelineEventRequest).unwrap();
    if (timeline) {
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  };

  return (
    <NewEventModal
      source="collections"
      timelines={[timeline]}
      onSubmit={onSubmit}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(Timelines.load(timelineProps))(NewEventModalContainer);
