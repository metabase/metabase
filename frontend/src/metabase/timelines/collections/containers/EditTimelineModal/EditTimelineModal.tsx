import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import { Timeline } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditTimelineModal from "../../components/EditTimelineModal";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalProps } from "../../types";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.update(timeline));
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onArchive: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.setArchived(timeline, true));
    dispatch(push(Urls.timelinesInCollection(timeline.collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(EditTimelineModal);
