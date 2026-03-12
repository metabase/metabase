import { Avatar, rem } from "@mantine/core";

import type { ColorName } from "metabase/lib/colors/types";

const avatarColors: ColorName[] = [
  "brand",
  "error",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
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
