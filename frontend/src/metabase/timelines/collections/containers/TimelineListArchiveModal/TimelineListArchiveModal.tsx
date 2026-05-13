import { push } from "react-router-redux";

import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { Collections } from "metabase/entities/collections";
import { useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Collection, Timeline } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListArchiveModalContainerProps {
  params: ModalParams;
  collection: Collection;
  onClose?: () => void;
}

const collectionProps = {
  id: (state: State, props: TimelineListArchiveModalContainerProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

function TimelineListArchiveModalContainer({
  params,
  ...props
}: TimelineListArchiveModalContainerProps) {
  const dispatch = useDispatch();
  const archive = useSetArchive();
  const collectionId = Urls.extractCollectionId(params.slug);
  const {
    data: timelines = [],
    isLoading,
    error,
  } = useListCollectionTimelinesQuery(
    collectionId != null
      ? { id: collectionId, include: "events", archived: true }
      : skipToken,
  );

  if (isLoading || error) {
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
      timelines={timelines}
      isArchive
      onUnarchive={onUnarchive}
      onGoBack={onGoBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(
  TimelineListArchiveModalContainer,
);
