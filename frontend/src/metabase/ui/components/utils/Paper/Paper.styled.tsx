import type { MantineThemeOverride, PaperStylesParams } from "@mantine/core";

export const getPaperOverrides = (): MantineThemeOverride["components"] => ({
  Paper: {
    defaultProps: {
      radius: "md",
      shadow: "md",
    },
    styles: (theme, _params: PaperStylesParams) => ({
      root: {
        color: theme.fn.themeColor("text-dark"),
        backgroundColor: theme.white,
        "&[data-with-border]": {
          borderColor: theme.fn.themeColor("border"),
        },
      },
    }),
  },
});
