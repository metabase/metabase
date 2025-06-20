import { type MantineThemeOverride, Notification } from "@mantine/core";

import { theme } from "metabase/dashboard/reducers-typed";

import NotificationStyles from "./Notification.module.css";

export const notificationOverrides: MantineThemeOverride["components"] = {
  Notification: Notification.extend({
    defaultProps: {
      withCloseButton: true,
      withBorder: false,
      radius: "md",
    },
    classNames: {
      root: NotificationStyles.root,
      body: NotificationStyles.body,
      title: NotificationStyles.title,
      description: NotificationStyles.description,
      closeButton: NotificationStyles.closeButton,
    },
    vars: (theme) => ({
      root: {
        "--notification-radius": theme.radius.md,
        "--notification-bg": "var(--mb-color-text-dark)",
        "--notification-color": "var(--mb-color-text-white)",
        "--notification-border": "none",
      },
    }),
  }),
};
