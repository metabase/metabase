import type { MantineThemeOverride } from "@mantine/core";
import generatedTheme from "../../../../styles/js/test";

export const theme: MantineThemeOverride = {
  ...generatedTheme,

  focusRingStyles: {
    styles(theme) {
      return {
        outline: `2px solid ${theme.colors.ocean[1]}`,
      };
    },
  },

  components: {
    Select: {
      styles(theme) {
        return {
          label: {
            color: theme.colors.orion[6],
            fontWeight: "bold",
            marginBottom: "0.2rem",
          },
          input: {
            ...theme.fn.focusStyles(),
          },
          itemWrapper: {
            padding: theme.spacing.m,
          },
          item: {
            "&[data-selected]": {
              "&,&:hover": {
                backgroundColor: theme.primaryColor,
              },
            },
            "&[data-hovered]": {
              backgroundColor: theme.colors.fog[1],
            },
          },
          ".mantine-Select-separatorLabel": {
            color: theme.colors.ocean[7],
          },
        };
      },
    },
  },
};
