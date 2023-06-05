import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";

export const theme: MantineThemeOverride = {
  colors: {
    brand: [color("brand-light"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
  },
  primaryColor: "brand",
  primaryShade: 1,
  fontFamily: "Lato, sans-serif",
  components: {
    Radio: {
      styles(theme) {
        return {
          root: {
            marginBottom: theme.spacing.xs,
          },
          label: {
            color: theme.colors.text[2],
            marginLeft: "-2px",
            fontWeight: 700,
            fontSize: "14px",
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
