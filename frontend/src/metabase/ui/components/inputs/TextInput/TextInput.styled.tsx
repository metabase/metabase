import type { MantineThemeOverride } from "@mantine/core";

export const getTextInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TextInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        wrapper: {
          marginTop: theme.spacing.xs,
        },
        input: {
          "&:read-only:not(:disabled)": {
            borderColor: theme.colors.text[0],
          },
        },
      }),
    },
  });
