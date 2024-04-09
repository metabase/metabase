import type { Timeline } from "metabase-types/api";

import TimelineDetailsModal from "../../containers/TimelineDetailsModal";
import TimelineListModal from "../../containers/TimelineListModal";
import type { ModalParams } from "../../types";

export interface TimelineIndexModalProps {
  timelines: Timeline[];
  params: ModalParams;
  onClose?: () => void;
}

const TimelineIndexModal = ({
  timelines,
  params,
  onClose,
}: TimelineIndexModalProps): JSX.Element => {
  if (timelines.length === 1) {
    return (
      <TimelineDetailsModal
        params={{ ...params, timelineId: timelines[0].id }}
        onClose={onClose}
      />
    );
  } else {
    return <TimelineListModal params={params} onClose={onClose} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineIndexModal;
