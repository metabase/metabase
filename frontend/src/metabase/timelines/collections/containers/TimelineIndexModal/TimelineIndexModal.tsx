import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
import {
  TimelineModal,
  TimelineModalLoadingState,
} from "metabase/timelines/common/components/TimelineModal";
import * as Urls from "metabase/urls";

import TimelineIndexModal from "../../components/TimelineIndexModal";
import type { ModalParams } from "../../types";

interface TimelineIndexModalContainerProps {
  params: ModalParams;
  onClose: () => void;
}

function TimelineIndexModalContainer({
  params,
  onClose,
}: TimelineIndexModalContainerProps) {
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timelines = [],
    isLoading,
    error,
  } = useListCollectionTimelinesQuery(
    collectionId != null ? { id: collectionId, include: "events" } : skipToken,
  );

  if (isLoading || error) {
    return (
      <TimelineModal tall onClose={onClose} animated={false}>
        <TimelineModalLoadingState loading={isLoading} error={error} />
      </TimelineModal>
    );
  }

  return (
    <TimelineIndexModal
      params={params}
      timelines={timelines}
      onClose={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineIndexModalContainer;
