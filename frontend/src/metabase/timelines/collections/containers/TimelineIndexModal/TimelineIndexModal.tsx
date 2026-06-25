import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
import * as Urls from "metabase/urls";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineIndexModal from "../../components/TimelineIndexModal";
import type { ModalParams } from "../../types";

interface TimelineIndexModalContainerProps {
  params: ModalParams;
  onClose?: () => void;
}

function TimelineIndexModalContainer({
  params,
  ...props
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
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  return (
    <TimelineIndexModal {...props} params={params} timelines={timelines} />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineIndexModalContainer;
