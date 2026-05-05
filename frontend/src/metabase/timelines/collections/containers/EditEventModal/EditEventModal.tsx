import type { ComponentProps } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { useSetArchive } from "metabase/common/hooks";
import { TimelineEvents } from "metabase/entities/timeline-events";
import { Timelines } from "metabase/entities/timelines";
import { connect, useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import * as Urls from "metabase/urls";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface EditEventModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: EditEventModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const timelineEventProps = {
  id: (state: State, props: EditEventModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent, timeline?: Timeline) => {
    await dispatch(TimelineEvents.actions.update(event));
    if (timeline) {
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  },
});

function EditEventModalContainer(props: ComponentProps<typeof EditEventModal>) {
  const archive = useSetArchive();
  const dispatch = useDispatch();
  const onArchive = async (event: TimelineEvent, timeline?: Timeline) => {
    await archive({ id: event.id, model: "timeline-event" }, true);
    if (timeline) {
      dispatch(push(Urls.timelineInCollection(timeline)));
    }
  };
  return <EditEventModal {...props} onArchive={onArchive} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModalContainer);
