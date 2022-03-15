import { t } from "ttag";
import { Collection, Timeline } from "metabase-types/api";
import { canonicalCollectionId } from "metabase/collections/utils";

export const getDefaultTimeline = (
  collection: Collection,
): Partial<Timeline> => {
  return {
    name: t`${collection.name} events`,
    collection_id: canonicalCollectionId(collection.id),
    icon: getDefaultTimelineIcon(),
  };
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

export const getDefaultTimelineIcon = () => {
  return "star";
};
