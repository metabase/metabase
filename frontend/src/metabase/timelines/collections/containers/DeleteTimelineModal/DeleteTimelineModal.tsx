import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import Collections from "metabase/entities/collections";
import { Collection, Timeline } from "metabase-types/api";
import { State } from "metabase-types/store";
import DeleteTimelineModal from "../../components/DeleteTimelineModal";
import { ModalProps } from "../../types";

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
  onSubmit: async (timeline: Timeline, collection: Collection) => {
    await dispatch(Timelines.actions.delete(timeline));
    dispatch(push(Urls.timelinesArchiveInCollection(collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(DeleteTimelineModal);
