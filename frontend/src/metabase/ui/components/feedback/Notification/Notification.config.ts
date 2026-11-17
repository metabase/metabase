import { type MantineThemeOverride, Notification } from "@mantine/core";

import S from "./Notification.module.css";

export const notificationOverrides: MantineThemeOverride["components"] = {
  Notification: Notification.extend({
    classNames: {
      root: S.root,
    },
  }),
};
