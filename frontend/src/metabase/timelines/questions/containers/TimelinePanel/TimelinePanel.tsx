import type { ComponentProps } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { CollectionId, TimelineEvent } from "metabase-types/api";

import TimelinePanel from "../../components/TimelinePanel";

type InnerProps = ComponentProps<typeof TimelinePanel>;

type TimelinePanelContainerProps = Omit<InnerProps, "collection"> & {
  collectionId?: CollectionId | null;
};

function TimelinePanelContainer({
  collectionId,
  ...props
}: TimelinePanelContainerProps) {
  const archive = useSetArchive();
  const {
    data: collection,
    isLoading,
    error,
  } = useGetCollectionQuery({
    id: collectionId == null ? ROOT_COLLECTION.id : collectionId,
  });
  const onArchiveEvent = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);
  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      {collection ? (
        <TimelinePanel
          {...props}
          collection={collection}
          onArchiveEvent={onArchiveEvent}
        />
      ) : null}
    </LoadingAndErrorWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePanelContainer;
