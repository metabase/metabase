import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
import { Collections } from "metabase/entities/collections";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import LoadingAndErrorWrapper from "../../components/LoadingAndErrorWrapper";
import TimelineListModal from "../../components/TimelineListModal";
import type { ModalParams } from "../../types";

interface TimelineListModalContainerProps {
  params: ModalParams;
  collection: Collection;
  onClose?: () => void;
}

const collectionProps = {
  id: (state: State, props: TimelineListModalContainerProps) =>
    Urls.extractCollectionId(props.params.slug),
  LoadingAndErrorWrapper,
};

function TimelineListModalContainer({
  params,
  ...props
}: TimelineListModalContainerProps) {
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

  return <TimelineListModal {...props} timelines={timelines} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(TimelineListModalContainer);
