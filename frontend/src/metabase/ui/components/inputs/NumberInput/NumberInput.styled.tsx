import type { MantineThemeOverride } from "@mantine/core";

export const getNumberInputOverrides =
  (): MantineThemeOverride["components"] => ({
    NumberInput: {
      defaultProps: {
        size: "md",
        hideControls: true,
      },
      styles: theme => ({
        input: {
          marginTop: theme.spacing.xs,
        },
      }),
    },
  });
