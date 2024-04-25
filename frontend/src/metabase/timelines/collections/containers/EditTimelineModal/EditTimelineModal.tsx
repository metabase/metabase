import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import EditTimelineModal from "metabase/timelines/common/components/EditTimelineModal";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import type { ModalParams } from "../../types";

interface EditTimelineModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: EditTimelineModalProps) =>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(EditTimelineModal);
