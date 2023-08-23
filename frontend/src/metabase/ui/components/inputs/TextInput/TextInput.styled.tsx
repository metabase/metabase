import type { MantineThemeOverride } from "@mantine/core";

export const getTextInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TextInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        input: {
          marginTop: theme.spacing.xs,
        },
      }),
    },
  });
