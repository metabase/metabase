import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import TimelineEvents from "metabase/entities/timeline-events";
import { TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import DeleteEventModal from "../../components/DeleteEventModal";
import { ModalProps } from "../../types";

const timelineEventProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.delete(event));
    dispatch(goBack());
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(DeleteEventModal);
