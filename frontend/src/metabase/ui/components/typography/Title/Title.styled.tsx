import type { MantineThemeOverride, TitleStylesParams } from "@mantine/core";

export const getTitleOverrides = (): MantineThemeOverride["components"] => ({
  Title: {
    styles: (theme, params: TitleStylesParams) => {
      if (params.element === "h3") {
        return {
          root: {
            fontWeight: "normal",
            textTransform: "uppercase",

            "&:lang(en)": {
              letterSpacing: "0.7px",
            },
          },
        };
      }

      return { root: {} };
    },
  },
});
