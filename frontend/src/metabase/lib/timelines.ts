import { t } from "ttag";
import { Collection, Timeline } from "metabase-types/api";
import { canonicalCollectionId } from "metabase/collections/utils";

export const getTimelineName = (timeline: Timeline) => {
  return timeline.default && timeline.collection
    ? getDefaultTimelineName(timeline.collection)
    : timeline.name;
};

export const getTimelineIcons = () => {
  return [
    { name: t`Star`, value: "star", icon: "star" },
    { name: t`Balloons`, value: "balloons", icon: "balloons" },
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

export const getDefaultTimelineIcon = () => {
  return "star";
};

export const getEventCount = ({ events = [], archived }: Timeline) => {
  return events.filter(e => e.archived === archived).length;
};
