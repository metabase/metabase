import { push } from "react-router-redux";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionTimelinesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListArchiveModalContainerProps {
  params: ModalParams;
  onClose?: () => void;
}

function TimelineListArchiveModalContainer({
  params,
  ...props
}: TimelineListArchiveModalContainerProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timelines = [],
    isLoading: isTimelinesLoading,
    error: timelinesError,
  } = useListCollectionTimelinesQuery(
    collectionId != null
      ? { id: collectionId, include: "events", archived: true }
      : skipToken,
  );
  const {
    data: collection,
    isLoading: isCollectionLoading,
    error: collectionError,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  const isLoading = isTimelinesLoading || isCollectionLoading;
  const error = timelinesError ?? collectionError;

  if (isLoading || error || !collection) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper />
    );
  }

  const onUnarchive = (timeline: Timeline) =>
    archive({ id: timeline.id, model: "timeline" }, false);

  const onGoBack = (collection: Collection) => {
    dispatch(push(Urls.timelinesInCollection(collection)));
  };

  return (
    <TimelineListModal
      {...props}
      collection={collection}
      timelines={timelines}
      isArchive
      onUnarchive={onUnarchive}
      onGoBack={onGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineListArchiveModalContainer;
