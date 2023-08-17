import type { MantineThemeOverride, TitleStylesParams } from "@mantine/core";

export const getTitleOverrides = (): MantineThemeOverride["components"] => ({
  Title: {
    styles: (theme, params: TitleStylesParams) => {
      if (params.element === "h3") {
        return {
          root: {
            fontWeight: "normal",
            letterSpacing: "0.7px",
            textTransform: "uppercase",
          },
        };
      }

      return { root: {} };
    },
  },
});
