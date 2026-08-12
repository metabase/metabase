import type { AvatarFactory } from "@mantine/core";
import { rem } from "@mantine/core";

import type { ColorName } from "metabase/ui/colors/types";

import { themeComponent } from "../../../utils/theme-component";

const avatarColors: ColorName[] = [
  "core-brand",
  "feedback-negative",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
];

export const avatarOverrides = {
  Avatar: themeComponent<AvatarFactory>({
    defaultProps: {
      allowedInitialsColors: avatarColors,
      color: "initials",
      size: rem(24),
      variant: "filled",
    },
  }),
};
