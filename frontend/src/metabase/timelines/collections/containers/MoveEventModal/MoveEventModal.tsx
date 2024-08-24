import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import TimelineEvents from "metabase/entities/timeline-events";
import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import MoveEventModal from "metabase/timelines/common/components/MoveEventModal";
import type { Timeline, TimelineEvent } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Loading from "../../components/Loading";
import type { ModalParams } from "../../types";

interface MoveEventModalProps {
  params: ModalParams;
}

const timelinesProps = {
  query: { include: "events" },
  Loading,
};

const timelineEventProps = {
  id: (state: State, props: MoveEventModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  Loading,
};

const collectionProps = {
  id: (state: State, props: MoveEventModalProps) =>
    Urls.extractCollectionId(props.params.slug),
  Loading,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (
    event: TimelineEvent,
    newTimeline: Timeline,
    oldTimeline: Timeline,
  ) => {
    await dispatch(TimelineEvents.actions.setTimeline(event, newTimeline));
    dispatch(push(Urls.timelineInCollection(oldTimeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.loadList(timelinesProps),
  TimelineEvents.load(timelineEventProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(MoveEventModal);
