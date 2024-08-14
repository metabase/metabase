import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import _ from "underscore";

import Timelines from "metabase/entities/timelines";
import * as Urls from "metabase/lib/urls";
import DeleteTimelineModal from "metabase/timelines/common/components/DeleteTimelineModal";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { ModalParams } from "../../types";

interface DeleteTimelineModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, props: DeleteTimelineModalProps) =>
    Urls.extractEntityId(props.params.timelineId),
  query: { include: "events" },
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.delete(timeline));
    dispatch(push(Urls.timelinesArchiveInCollection(timeline.collection)));
  },
  onCancel: () => {
    dispatch(goBack());
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(DeleteTimelineModal);
