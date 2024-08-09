import type {
  MantineThemeOverride,
  ActionIconStylesParams,
} from "@mantine/core";

import { getPrimaryColor } from "../../../utils/colors";

export const getActionIconOverrides =
  (): MantineThemeOverride["components"] => ({
    ActionIcon: {
      defaultProps: {
        color: "brand",
        variant: "transparent",
        size: "2rem",
      },
      variants: {
        // Default variant is "subtle"
        subtle: () => ({
          root: {
            color: "var(--mb-color-text-tertiary)",
            "&:hover": {
              color: "var(--mb-color-text-secondary)",
              backgroundColor: "var(--mb-color-bg-light)",
            },
          },
        }),
        filled: (theme, params) => ({
          root: {
            color: theme.fn.themeColor("white"),
            backgroundColor: theme.fn.themeColor(params.color),
            border: `1px solid ${theme.fn.themeColor(params.color)}`,
            transition: "background 300ms linear, border 300ms linear",
            "&:hover": {
              backgroundColor: theme.fn.themeColor("white"),
              border: `1px solid ${theme.fn.themeColor(params.color)}`,
              color: theme.fn.themeColor(params.color),
            },
          },
        }),
        viewHeader: theme => ({
          root: {
            color: theme.fn.themeColor("text-dark"),
            backgroundColor: "transparent",
            border: "1px solid transparent",
            transition: "all 300ms linear",
            "&:hover": {
              color: theme.fn.themeColor("brand"),
              backgroundColor: theme.fn.themeColor("bg-medium"),
              border: "1px solid transparent",
            },
            "&:disabled, &[data-disabled]": {
              color: theme.fn.themeColor("text-light"),
              backgroundColor: "transparent",
            },
          },
        }),
        transparent: (theme, { color }: ActionIconStylesParams) => ({
          root: {
            color: theme.fn.themeColor("text-dark"),
            "&:hover": {
              color: getPrimaryColor(theme, color),
              backgroundColor: theme.fn.themeColor("bg-medium"),
            },
          },
        }),
        filled: (theme, { color = "brand" }: ActionIconStylesParams) => {
          const primaryColor = getPrimaryColor(theme, color);

          return {
            root: {
              color: theme.fn.themeColor("white"),
              backgroundColor: primaryColor,
              "&:hover": {
                color: primaryColor,
                backgroundColor: theme.fn.themeColor("bg-medium"),
                borderColor: primaryColor,
              },
            },
          };
        },
      },
    },
  });
