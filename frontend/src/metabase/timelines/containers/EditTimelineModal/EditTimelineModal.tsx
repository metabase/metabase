import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import { Collection, Timeline } from "metabase-types/api";
import { State } from "metabase-types/store";
import EditTimelineModal from "../../components/EditTimelineModal";
import { ModalProps } from "../../types";
import Collections from "metabase/entities/collections";

const timelineProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

const collectionProps = {
  id: (state: State, props: ModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.update(timeline));
    dispatch(goBack());
  },
  onArchive: async (timeline: Timeline, collection: Collection) => {
    await dispatch(Timelines.actions.setArchived(timeline, true));
    dispatch(goBack());
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(EditTimelineModal);
