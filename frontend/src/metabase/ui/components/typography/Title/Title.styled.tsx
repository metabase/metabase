import type { MantineThemeOverride, TitleStylesParams } from "@mantine/core";

export const getTitleOverrides = (): MantineThemeOverride["components"] => ({
  Title: {
    styles: (theme, params: TitleStylesParams) => {
      if (params.element === "h3") {
        return {
          root: {
            fontWeight: "normal",
            textTransform: "uppercase",

            // https://developer.mozilla.org/en-US/docs/Web/CSS/letter-spacing#internationalization_concerns
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
