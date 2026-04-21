import { type MantineThemeOverride, Text } from "@mantine/core";

import TextStyles from "./Text.module.css";

export const textOverrides: MantineThemeOverride["components"] = {
  Text: Text.extend({
    defaultProps: {
      color: "text-primary",
      size: "md",
      component: "div",
    },
    classNames: {
      root: TextStyles.root,
    },
  }),
};
