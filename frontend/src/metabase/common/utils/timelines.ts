import { t } from "ttag";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/common/collections/utils";
import type {
  Collection,
  CollectionId,
  CreateTimelineRequest,
  IconName,
  Timeline,
  TimelineIcon,
} from "metabase-types/api";

export const getTimelineName = (timeline: Timeline) => {
  return timeline.default && timeline.collection
    ? getDefaultTimelineName(timeline.collection)
    : timeline.name;
};

export const getTimelineIcons = (): {
  label: string;
  value: IconName;
  icon: IconName;
}[] => {
  return (
    [
      { label: t`Info`, value: "info" },
      { label: t`Note`, value: "note" },
      { label: t`Event`, value: "event" },
      { label: t`Star`, value: "star" },
      { label: t`Cake`, value: "cake" },
      { label: t`Mail`, value: "mail_at" },
      { label: t`Warning`, value: "warning" },
      { label: t`Bell`, value: "bell" },
      { label: t`Cloud`, value: "cloud" },
    ] as const
  ).map((item) => ({ ...item, icon: item.value }));
};

export const getDefaultTimeline = (
  collection: Collection,
): CreateTimelineRequest => {
  return {
    name: getDefaultTimelineName(collection),
    collection_id: canonicalCollectionId(collection.id),
    icon: getDefaultTimelineIcon(),
    default: true,
  };
};

/**
 * null, "root" and "tenant" mean the root collection, whose timelines have a
 * null collection_id, other ids are compared as is
 */
export const isCollectionTimeline = (
  timeline: Timeline,
  collectionId: CollectionId | null | undefined,
) =>
  canonicalCollectionId(collectionId) === null
    ? timeline.collection_id == null
    : timeline.collection_id === collectionId;

export const getCollectionTimelines = (
  timelines: Timeline[],
  collectionId: CollectionId | null | undefined,
): Timeline[] =>
  timelines.filter((timeline) => isCollectionTimeline(timeline, collectionId));

export const getDefaultTimelineName = (collection: Collection) => {
  return t`${collection.name} events`;
};

export const getDefaultTimelineIcon = (): TimelineIcon => {
  return "star";
};

export const getSortedTimelines = (
  timelines: Timeline[],
  collection?: Collection,
) => {
  return _.chain(timelines)
    .sortBy((timeline) => getTimelineName(timeline).toLowerCase())
    .sortBy((timeline) => timeline.collection?.personal_owner_id != null) // personal collections last
    .sortBy((timeline) => !timeline.default) // default timelines first
    .sortBy((timeline) => timeline.collection?.id !== collection?.id) // timelines within the collection first
    .value();
};

export const getEventCount = ({ events = [], archived }: Timeline) => {
  return events.filter((e) => e.archived === archived).length;
};
