import type { MantineThemeOverride } from "@mantine/core";

export const getTextOverrides = (): MantineThemeOverride["components"] => ({
  Text: {
    defaultProps: {
      color: "text.2",
      size: "md",
    },
    sizes: {
      md: () => ({
        root: {
          lineHeight: "1.5rem",
        },
      }),
      lg: () => ({
        root: {
          lineHeight: "1.5rem",
        },
      }),
    },
  },
});
