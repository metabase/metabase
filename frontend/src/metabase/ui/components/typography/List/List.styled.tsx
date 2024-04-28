import type { MantineThemeOverride } from "@mantine/core";

export const getListOverrides = (): MantineThemeOverride["components"] => ({
  List: {
    styles: theme => {
      return {
        root: {
          // to revert "none" from the reset
          listStyleType: "revert",
        },
        item: {
          lineHeight: "1.5",
          color: theme.fn.themeColor("text-dark"),
        },
      };
    },
  },
});
