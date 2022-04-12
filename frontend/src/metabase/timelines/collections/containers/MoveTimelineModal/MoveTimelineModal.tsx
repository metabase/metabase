import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Timelines from "metabase/entities/timelines";
import MoveTimelineModal from "metabase/timelines/common/components/MoveTimelineModal";
import { Timeline } from "metabase-types/api";
import { State } from "metabase-types/store";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { ModalParams } from "../../types";

interface MoveTimelineModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: MoveTimelineModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (timeline: Timeline, collectionId: number | null) => {
    const collection = { id: collectionId };
    await dispatch(Timelines.actions.setCollection(timeline, collection));
    dispatch(push(Urls.timelineInCollection(timeline)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(MoveTimelineModal);
