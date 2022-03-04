import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import TimelineEvents from "metabase/entities/timeline-events";
import { TimelineEvent } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditEventModal from "../../components/EditEventModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineEventProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineEventId),
  entityAlias: "event",
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.update(event));
    dispatch(goBack());
  },
  onArchive: async (event: TimelineEvent) => {
    await dispatch(TimelineEvents.actions.setArchived(event, true));
    dispatch(goBack());
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  TimelineEvents.load(timelineEventProps),
  connect(null, mapDispatchToProps),
)(EditEventModal);
