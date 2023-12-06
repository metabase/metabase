import type { MantineThemeOverride, PaperStylesParams } from "@mantine/core";

export const getPaperOverrides = (): MantineThemeOverride["components"] => ({
  Paper: {
    defaultProps: {
      radius: "md",
      shadow: "md",
    },
    styles: (theme, _params: PaperStylesParams) => ({
      root: {
        color: theme.colors.text[2],
        backgroundColor: theme.white,
        "&[data-with-border]": {
          borderColor: theme.colors.border[0],
        },
      },
    }),
  },
});
