import { Avatar, rem } from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

const avatarColors = [
  "var(--mb-color-brand)",
  "var(--mb-color-error)",
  color("accent1"),
  color("accent2"),
  color("accent3"),
  color("accent4"),
  color("accent5"),
  color("accent6"),
  color("accent7"),
];

export const avatarOverrides = {
  Avatar: Avatar.extend({
    defaultProps: {
      allowedInitialsColors: avatarColors,
      color: "initials",
      size: rem(24),
      variant: "filled",
    },
  }),
};
