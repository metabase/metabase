import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";

import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import MoveTimelineModal from "metabase/timelines/common/components/MoveTimelineModal";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { setCollectionAndNavigate } from "../../actions";
import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

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
    dispatch(setCollectionAndNavigate(timeline, collectionId));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(MoveTimelineModal);
