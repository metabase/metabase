import type { MantineThemeOverride } from "@mantine/core";

export const getTimeInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TimeInput: {
      defaultProps: {
        size: "md",
      },
      styles: () => ({
        input: {
          color: "var(--mb-color-text-primary)",
          backgroundColor: "var(--mb-color-background)",
        },
      }),
    },
  });
