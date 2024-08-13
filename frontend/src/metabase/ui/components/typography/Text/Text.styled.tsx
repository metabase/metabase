import type { MantineThemeOverride } from "@mantine/core";

export const getTextOverrides = (): MantineThemeOverride["components"] => ({
  Text: {
    defaultProps: {
      color: "var(--mb-color-text-primary)",
      size: "md",
      variant: "default",
    },
    variants: {
      monospace: theme => ({
        root: {
          fontFamily: theme.fontFamilyMonospace,
          whiteSpace: "pre",
        },
      }),
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
