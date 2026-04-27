import { push } from "react-router-redux";
import _ from "underscore";

import { TimelineEvents } from "metabase/entities/timeline-events";
import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import NewEventModal from "metabase/timelines/common/components/NewEventModal";
import * as Urls from "metabase/utils/urls";
import type { Collection, Timeline, TimelineEvent } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

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
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
)(NewEventModal);
