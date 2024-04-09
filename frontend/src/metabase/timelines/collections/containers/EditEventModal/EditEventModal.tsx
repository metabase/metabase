import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import EditEventModal from "metabase/timelines/common/components/EditEventModal";
import type { Timeline, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

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
    timeline && dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onArchive: async (event: TimelineEvent, timeline?: Timeline) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
    timeline && dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
