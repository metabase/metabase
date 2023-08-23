import { getStylesRef } from "@mantine/core";
import type {
  CheckboxStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { CheckboxIcon } from "./CheckboxIcon";

export const getCheckboxOverrides = (): MantineThemeOverride["components"] => ({
  Checkbox: {
    defaultProps: {
      icon: CheckboxIcon,
      size: "md",
    },
    styles: (theme: MantineTheme, { labelPosition }: CheckboxStylesParams) => ({
      root: {
        "& + &": {
          marginTop: theme.spacing.md,
        },
      },
      input: {
        cursor: "pointer",
        borderRadius: theme.radius.xs,
        width: "1.25rem",
        height: "1.25rem",

        "&:checked": {
          borderColor: theme.colors.brand[1],
          backgroundColor: theme.colors.brand[1],
        },
        "&:disabled": {
          borderColor: theme.colors.border[0],
          backgroundColor: theme.colors.border[0],
          [`.${getStylesRef("icon")}`]: {
            color: theme.colors.text[0],
          },
        },
      },
      label: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        fontWeight: "bold",
        lineHeight: "1rem",
        paddingLeft: labelPosition === "left" ? theme.spacing.sm : undefined,
        paddingRight: labelPosition === "right" ? theme.spacing.sm : undefined,
      },
      description: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        lineHeight: "1rem",
        marginTop: theme.spacing.xs,
      },
      icon: {
        ref: getStylesRef("icon"),
        color: theme.white,
      },
    }),
  },
});
