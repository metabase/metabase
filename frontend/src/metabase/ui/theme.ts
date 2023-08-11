import { getStylesRef } from "@mantine/core";
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
    Menu: {
      defaultProps: {
        radius: "0.375rem",
      },
      styles(theme) {
        return {
          dropdown: {
            padding: "0.75rem !important",
          },
          item: {
            color: theme.colors.text[2],
            fontSize: theme.fontSizes.md,
            fontWeight: 700,
            padding: theme.spacing.md,

            "&:hover, &:focus": {
              color: theme.colors.brand[1],
              backgroundColor: theme.colors.brand[0],

              [`& .${getStylesRef("itemRightSection")}`]: {
                color: theme.colors.brand[1],
              },
            },
          },
          itemIcon: {
            marginRight: "0.75rem",
          },
          itemRightSection: {
            ref: getStylesRef("itemRightSection"),
            color: theme.colors.text[0],
            marginLeft: "0.75rem",
          },
          label: {
            color: theme.colors.text[0],
            fontSize: theme.fontSizes.md,
            fontWeight: 700,
            padding: `0.375rem ${theme.spacing.md}`,
          },
          divider: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.sm,
            marginLeft: theme.spacing.md,
            marginRight: theme.spacing.md,
            borderTopColor: theme.colors.border[0],
          },
        };
      },
    },
  },
};
