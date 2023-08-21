import { Anchor } from "@mantine/core";
import type { MantineThemeComponents } from "@mantine/core";
import type { ClassNamesContent } from "@emotion/react";

export const getAnchorOverrides = ({
  css,
}: ClassNamesContent): MantineThemeComponents => ({
  Anchor: Anchor.extend({
    classNames: theme => {
      return {
        root: css({
          fontFamily: "inherit",
          color: theme.primaryColor,
          "&:active": {
            color: theme.colors.text[2],
            textDecoration: "underline",
          },
        }),
      };
    },
  }),
});
