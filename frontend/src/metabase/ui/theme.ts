import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";
import { CheckboxIcon } from "metabase/ui/components/inputs/Checkbox/CheckboxIcon";

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
    Checkbox: {
      defaultProps: {
        icon: CheckboxIcon,
      },
      styles(theme, params) {
        return {
          root: {
            marginBottom: theme.spacing.xs,
          },
          label: {
            fontWeight: 700,
            color: theme.colors.text[2],
            [`padding${params.labelPosition === "left" ? "Right" : "Left"}`]:
              theme.spacing.xs,
          },
          input: {
            "&:focus": {
              outline: `2px solid ${theme.colors.brand[1]}`,
            },
            "&:disabled": {
              background: theme.colors.border[0],
              border: 0,
              "& + svg > *": {
                fill: theme.colors.text[0],
              },
            },
            cursor: "pointer",
            ...(params.indeterminate && {
              background: theme.colors.brand[1],
              border: `1px solid ${theme.colors.brand[1]}`,
            }),
          },
          ...(params.indeterminate && {
            icon: {
              "& > *": {
                fill: color("white"),
              },
            },
          }),
        };
      },
    },
    CheckboxGroup: {
      styles(theme) {
        /* Note: we need the ':has' selector to target the space just
         * above the first checkbox since we don't seem to have selector
         * or a way to use params to detect whether group label/description
         * exists. This is a bit of a hack, but it works. */

        return {
          label: {
            fontWeight: 700,
            color: theme.colors.text[2],
            "&:has(+ .mantine-Checkbox-root)": {
              marginBottom: theme.spacing.sm,
            },
          },
          description: {
            "&:has(+ .mantine-Checkbox-root)": {
              marginBottom: theme.spacing.sm,
            },
          },
        };
      },
    },
    Accordion: {
      styles(theme) {
        return {
          control: {
            paddingLeft: 14,
            "&:hover": {
              background: "unset",
            },
          },
          label: {
            color: theme.colors.brand[1],
            fontWeight: 700,
          },
          item: {
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.spacing.xs,
            "&[data-active]": {
              border: `1px solid ${theme.colors.border}`,
            },
            "& + &": {
              marginTop: "0.75rem",
            },
          },
          content: {
            borderTop: `1px solid ${theme.colors.border}`,
            color: theme.colors.text[2],
          },
          chevron: {
            color: theme.colors.text[2],
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
