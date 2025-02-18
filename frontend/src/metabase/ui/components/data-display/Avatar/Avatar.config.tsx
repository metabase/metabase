import { Avatar } from "@mantine/core";

export const avatarOverrides = {
  Avatar: Avatar.extend({
    defaultProps: {
      size: "lg",
      color: "brand",
      variant: "filled",
    },
  }),
};
