import { Badge } from "@mantine/core";

import BadgeStyles from "./Badge.module.css";

export const badgeOverrides = {
  Badge: Badge.extend({
    defaultProps: {
      variant: "light",
    },
    classNames: {
      root: BadgeStyles.root,
    },
  }),
};
