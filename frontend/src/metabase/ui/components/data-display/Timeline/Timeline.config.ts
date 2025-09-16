import { Timeline } from "@mantine/core";

import TimelineStyles from "./Timeline.module.css";

export const timelineOverrides = {
  Timeline: Timeline.extend({
    classNames: {
      item: TimelineStyles.item,
      itemBullet: TimelineStyles.itemBullet,
    },
  }),
};
