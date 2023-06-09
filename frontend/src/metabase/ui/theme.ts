import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";

export const theme: MantineThemeOverride = {
  colors: {
    brand: [color("brand-light"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
    border: [color("border")],
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
    Accordion: {
      styles(theme) {
        return {
          control: {
            paddingLeft: 14,
          },
          label: {
            color: theme.colors.brand[1],
            fontWeight: 700,
          },
          item: {
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.spacing.xs,
            backgroundColor: "transparent",
            "&[data-active]": {
              border: `1px solid ${theme.colors.border}`,
            },
            "& + &": {
              marginTop: "0.75rem",
            },
          },
          content: {
            borderTop: `1px solid ${theme.colors.border}`,
          },
          chevron: {
            border: `1px solid ${theme.colors.border}`,
            borderRadius: "100%",
            marginLeft: "1rem",
            height: "1.75rem",
            width: "1.75rem",
          },
        };
      },
    },
  },
};
