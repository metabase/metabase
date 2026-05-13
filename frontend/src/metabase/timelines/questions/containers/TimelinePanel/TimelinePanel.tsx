import type { ComponentProps } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { useSetArchive } from "metabase/common/hooks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
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
  const { data: collection } = useGetCollectionQuery({
    id: collectionId == null ? ROOT_COLLECTION.id : collectionId,
  });
  const onArchiveEvent = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);
  if (!collection) {
    return null;
  }
  return (
    <TimelinePanel
      {...props}
      collection={collection}
      onArchiveEvent={onArchiveEvent}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelinePanelContainer;
