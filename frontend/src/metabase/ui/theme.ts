import type { MantineThemeOverride } from "@mantine/core";

import { color } from "metabase/lib/colors";
import { CheckboxIcon } from "metabase/ui/components/inputs/Checkbox/CheckboxIcon";
import { getButtonOverrides } from "metabase/ui/components/buttons/Button/theme";
import { getMenuOverrides } from "metabase/ui/components/overlays/Menu/theme";

export const theme: MantineThemeOverride = {
  colors: {
    brand: [color("brand-light"), color("brand")],
    text: [color("text-light"), color("text-medium"), color("text-dark")],
    border: [color("border")],
    bg: [color("bg-light"), color("bg-medium"), color("bg-dark")],
  },
  primaryColor: "brand",
  primaryShade: 1,
  shadows: {
    md: "0px 4px 20px 0px rgba(0, 0, 0, 0.05)",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "8px",
  },
  fontSizes: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "17px",
    xl: "21px",
  },
  fontFamily: 'Lato, "Helvetica Neue", Helvetica, sans-serif',
  fontFamilyMonospace: "Monaco, monospace",
  components: {
    Radio: {
      styles(theme) {
        return {
          root: {
            marginBottom: theme.spacing.md,
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
            marginBottom: theme.spacing.md,
          },
        };
      },
    },
    Checkbox: {
      defaultProps: {
        icon: CheckboxIcon,
        size: "md",
      },
      styles(theme, params) {
        return {
          root: {
            marginBottom: theme.spacing.md,
          },
          label: {
            fontWeight: 700,
            color: theme.colors.text[2],
            [`padding${params.labelPosition === "left" ? "Right" : "Left"}`]:
              theme.spacing.sm,
          },
          input: {
            borderRadius: theme.radius.xs,

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
            transform: `scale(0.75)`,
          },
          icon: {
            ...(params.indeterminate && {
              "& > *": {
                fill: color("white"),
              },
            }),
          },
        };
      },
    },
    CheckboxGroup: {
      defaultProps: {
        size: "md",
      },
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
              marginBottom: theme.spacing.md,
            },
          },
          description: {
            "&:has(+ .mantine-Checkbox-root)": {
              marginBottom: theme.spacing.md,
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
            borderRadius: theme.spacing.sm,
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
    Text: {
      defaultProps: {
        color: "text.2",
      },
    },
    Anchor: {
      styles(theme) {
        return {
          root: {
            fontFamily: "inherit",
            color: theme.colors.brand[1],
            "&:focus": {
              outline: `2px solid ${theme.colors.brand[0]}`,
              outlineOffset: "2px",
            },
            "&:active": {
              color: theme.colors.text[2],
              textDecoration: "underline",
            },
          },
        };
      },
    },
    ...getButtonOverrides(),
    ...getMenuOverrides(),
  },
};
