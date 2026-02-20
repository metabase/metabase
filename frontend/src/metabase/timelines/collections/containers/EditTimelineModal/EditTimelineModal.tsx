import _ from "underscore";

import { Timelines } from "metabase/entities/timelines";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import EditTimelineModal from "metabase/timelines/common/components/EditTimelineModal";
import type { Timeline } from "metabase-types/api";
import type { State } from "metabase-types/store";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import { navigateToPath } from "../../navigation";
import type { ModalParams } from "../../types";

interface EditTimelineModalProps {
  params: ModalParams;
}

const timelineProps = {
  id: (state: State, { params }: EditTimelineModalProps) =>
    Urls.extractEntityId(params.timelineId),
  query: { include: "events" },
  LoadingAndErrorWrapper,
};

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.update(timeline));
    navigateToPath(Urls.timelineInCollection(timeline));
  },
  onArchive: async (timeline: Timeline) => {
    await dispatch(Timelines.actions.setArchived(timeline, true));
    navigateToPath(Urls.timelinesInCollection(timeline.collection));
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Timelines.load(timelineProps),
  connect(null, mapDispatchToProps),
)(EditTimelineModal);
