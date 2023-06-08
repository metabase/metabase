import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";

export const theme: MantineThemeOverride = {
  colors: {
    brand: [color("brand-light"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
  },
  primaryColor: "brand",
  primaryShade: 1,
  fontSizes: {
    xs: "10px",
    sm: "14px",
    md: "16px",
    lg: "18px",
    xl: "24px",
  },
  fontFamily: 'Lato, "Helvetica Neue", Helvetica, sans-serif',
  components: {
    Radio: {
      styles(theme) {
        return {
          root: {
            marginBottom: theme.spacing.xs,
          },
          label: {
            color: theme.colors.text[2],
            fontWeight: 700,
          },
        };
      },
    },
    RadioGroup: {
      styles(theme) {
        return {
          label: {
            fontWeight: 700,
            color: theme.colors.text[2],
          },
          description: {
            marginBottom: theme.spacing.xs,
          },
        };
      },
    },
  },
};
