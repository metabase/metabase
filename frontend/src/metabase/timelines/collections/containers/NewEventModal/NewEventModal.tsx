import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import TimelineEvents from "metabase/entities/timeline-events";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalParams } from "../../types";

interface NewEventModalProps {
  params: ModalParams;
  timeline: Timeline;
}

const timelineProps = {
  id: (state: State, props: NewEventModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const mapStateToProps = (state: State, { timeline }: NewEventModalProps) => ({
  source: "collections",
  timelines: [timeline],
});

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
)(NewEventModal);
