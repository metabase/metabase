import type { TimelineFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import TimelineStyles from "./Timeline.module.css";

export const timelineOverrides = {
  Timeline: themeComponent<TimelineFactory>({
    classNames: {
      item: TimelineStyles.item,
      itemBullet: TimelineStyles.itemBullet,
    },
  }),
};
