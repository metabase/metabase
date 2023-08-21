import { Title } from "@mantine/core";
import type { MantineThemeComponents } from "@mantine/core";
import type { ClassNamesContent } from "@emotion/react";

export const getTitleOverrides = ({
  css,
}: ClassNamesContent): MantineThemeComponents => ({
  Title: Title.extend({
    classNames: (theme, props) => {
      if (props.order === 3) {
        return {
          root: css({
            fontWeight: "normal",
            textTransform: "uppercase",

            // https://developer.mozilla.org/en-US/docs/Web/CSS/letter-spacing#internationalization_concerns
            "&:lang(en)": {
              letterSpacing: "0.7px",
            },
          }),
        };
      }

      return { root: "" };
    },
  }),
});
