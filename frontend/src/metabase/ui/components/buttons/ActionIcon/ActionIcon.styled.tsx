import type {
  MantineThemeOverride,
  ActionIconStylesParams,
} from "@mantine/core";

import { getPrimaryColor } from "../../../utils/colors";

export const getActionIconOverrides =
  (): MantineThemeOverride["components"] => ({
    ActionIcon: {
      variants: {
        subtle: theme => ({
          root: {
            color: theme.fn.themeColor("text-light"),
            "&:hover": {
              color: theme.fn.themeColor("text-medium"),
              backgroundColor: theme.fn.themeColor("bg-light"),
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
