import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import NewEventModal from "../../components/NewEventModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (
    values: Partial<TimelineEvent>,
    collection: Collection,
    timeline: Timeline,
  ) => {
    await dispatch(TimelineEvents.actions.create(values));
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(NewEventModal);
