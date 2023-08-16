import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { CheckboxIcon } from "./CheckboxIcon";

export const getCheckboxOverrides = (): MantineThemeOverride["components"] => ({
  Checkbox: {
    defaultProps: {
      icon: CheckboxIcon,
      size: "md",
    },
    styles: (theme: MantineTheme, params) => {
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
              fill: theme.white,
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
    styles: (theme: MantineTheme) => {
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
});
