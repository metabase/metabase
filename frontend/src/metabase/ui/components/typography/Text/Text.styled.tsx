import type { MantineThemeOverride } from "@mantine/core";

export const getTextOverrides = (): MantineThemeOverride["components"] => ({
  Text: {
    defaultProps: {
      color: "text.2",
    },
  },
});
