import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";

export const theme: MantineThemeOverride = {
  colors: {
    brand: [color("brand")],
    text: [color("text-dark"), color("text-medium")],
  },
  primaryColor: "brand",
  fontFamily: "Lato, sans-serif",
  components: {
    Radio: {
      styles(theme) {
        return {
          root: {
            marginBottom: theme.spacing.xs,
          },
          label: {
            color: theme.colors.text[0],
            marginLeft: "-2px",
            fontWeight: 700,
            fontSize: "14px",
          },
          radio: {
            "&:checked": {
              backgroundColor: theme.colors.brand[0],
              borderColor: theme.colors.brand[0],
            },
          },
        };
      },
    },
    RadioGroup: {
      styles(theme) {
        return {
          description: {
            marginBottom: theme.spacing.xs,
          },
        };
      },
    },
  },
};
