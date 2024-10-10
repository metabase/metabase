import { type MantineThemeOverride, Text } from "@mantine/core";

import TextStyles from "./Text.module.css";

export const textOverrides: MantineThemeOverride["components"] = {
  Text: Text.extend({
    defaultProps: {
      color: "var(--mb-color-text-primary)",
      size: "md",
    },
    classNames: {
      root: TextStyles.root,
    },
  }),
};
