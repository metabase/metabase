import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
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
  const { data: timelines = [] } = useListCollectionTimelinesQuery(
    collectionId != null ? { id: collectionId, include: "events" } : skipToken,
  );

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
