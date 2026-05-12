import type { ComponentProps } from "react";

import { useSetArchive } from "metabase/common/hooks";
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import type { State } from "metabase/redux/store";
import type { TimelineEvent } from "metabase-types/api";

import TimelinePanel from "../../components/TimelinePanel";

interface TimelinePanelProps {
  collectionId?: number;
}

const collectionProps = {
  id: (state: State, props: TimelinePanelProps) => {
    return props.collectionId ?? ROOT_COLLECTION.id;
  },
};

function TimelinePanelContainer(props: ComponentProps<typeof TimelinePanel>) {
  const archive = useSetArchive();
  const onArchiveEvent = (event: TimelineEvent) =>
    archive({ id: event.id, model: "timeline-event" }, true);
  return <TimelinePanel {...props} onArchiveEvent={onArchiveEvent} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(TimelinePanelContainer);
