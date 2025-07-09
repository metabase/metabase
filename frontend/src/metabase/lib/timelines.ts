import { t } from "ttag";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";
import type { IconName } from "metabase/ui";
import type { Collection, Timeline, TimelineIcon } from "metabase-types/api";

export const getTimelineName = (timeline: Timeline) => {
  return timeline.default && timeline.collection
    ? getDefaultTimelineName(timeline.collection)
    : timeline.name;
};

export const getTimelineIcons = (): { label: string; value: IconName }[] => {
  return [
    { label: t`Star`, value: "star" },
    { label: t`Cake`, value: "cake" },
    { label: t`Mail`, value: "mail" },
    { label: t`Warning`, value: "warning" },
    { label: t`Bell`, value: "bell" },
    { label: t`Cloud`, value: "cloud" },
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
    .sortBy((timeline) => getTimelineName(timeline).toLowerCase())
    .sortBy((timeline) => timeline.collection?.personal_owner_id != null) // personal collections last
    .sortBy((timeline) => !timeline.default) // default timelines first
    .sortBy((timeline) => timeline.collection?.id !== collection?.id) // timelines within the collection first
    .value();
};

export const getEventCount = ({ events = [], archived }: Timeline) => {
  return events.filter((e) => e.archived === archived).length;
};
