import { t } from "ttag";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";
import type { Collection, Timeline, TimelineIcon } from "metabase-types/api";

export const getTimelineName = (timeline: Timeline) => {
  return timeline.default && timeline.collection
    ? getDefaultTimelineName(timeline.collection)
    : timeline.name;
};

export const getTimelineIcons = () => {
  return [
    { name: t`Star`, value: "star", icon: "star" },
    { name: t`Cake`, value: "cake", icon: "cake" },
    { name: t`Mail`, value: "mail", icon: "mail" },
    { name: t`Warning`, value: "warning", icon: "warning" },
    { name: t`Bell`, value: "bell", icon: "bell" },
    { name: t`Cloud`, value: "cloud", icon: "cloud" },
  ];
};

export const getDefaultTimeline = (
  collection: Collection,
): Partial<Timeline> => {
  return {
    name: getDefaultTimelineName(collection),
    collection_id: canonicalCollectionId(collection.id),
    icon: getDefaultTimelineIcon(),
    default: true,
  };
};

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
    .sortBy(timeline => getTimelineName(timeline).toLowerCase())
    .sortBy(timeline => timeline.collection?.personal_owner_id != null) // personal collections last
    .sortBy(timeline => !timeline.default) // default timelines first
    .sortBy(timeline => timeline.collection?.id !== collection?.id) // timelines within the collection first
    .value();
};

export const getEventCount = ({ events = [], archived }: Timeline) => {
  return events.filter(e => e.archived === archived).length;
};
