import type { MantineThemeOverride } from "@mantine/core";
import { colors as mbColors } from "metabase/lib/colors";
// import generatedTheme from "../../../../styles/js/test";

export const theme: MantineThemeOverride = {
  // ...generatedTheme,
  colors: {
    brand: [mbColors.brand],
    fg: ["red", "blue"],
    text: ["509ee3"],
  },

  primaryColor: "brand",

  focusRingStyles: {
    styles(theme) {
      return {
        outline: `2px solid ${theme.colors.fg[1]}`,
      };
    },
  },

  components: {
    Select: {
      styles(theme) {
        return {
          label: {
            color: theme.colors.text[0],
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
              backgroundColor: theme.colors.brand[0],
            },
          },
          ".mantine-Select-separatorLabel": {
            color: theme.colors.text[0],
          },
        };
      },
    },
  },
};
