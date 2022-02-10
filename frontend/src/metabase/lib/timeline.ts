import { t } from "ttag";
import { Collection, TimelineEvent, Timeline } from "metabase-types/api";

export const getDefaultEvent = (
  values: Partial<TimelineEvent>,
  timeline: Timeline,
): Partial<TimelineEvent> => {
  return {
    ...values,
    timeline_id: timeline.id,
  };
};

export const getDefaultTimeline = (
  collection: Collection,
): Partial<Timeline> => {
  return {
    name: t`${collection.name} events`,
    collection_id: collection.id,
    icon: "star",
  };
};

export const getEventIcons = () => {
  return [
    {
      name: t`Star`,
      value: "star",
      icon: "star",
    },
    {
      name: t`Balloons`,
      value: "balloons",
      icon: "balloons",
    },
    {
      name: t`Mail`,
      value: "mail",
      icon: "mail",
    },
    {
      name: t`Warning`,
      value: "warning",
      icon: "warning",
    },
    {
      name: t`Bell`,
      value: "bell",
      icon: "bell",
    },
    {
      name: t`Cloud`,
      value: "cloud",
      icon: "cloud",
    },
  ];
};
