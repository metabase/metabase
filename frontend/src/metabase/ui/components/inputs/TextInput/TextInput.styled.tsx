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
      }),
      variants: {
        filled: (theme, params, context) => {
          console.log(theme, params, context)
          return {
            input: {
              backgroundColor: theme.colors.bg[0],
            },
          };
        },
      },
    },
  });
