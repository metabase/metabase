import type { MantineThemeOverride } from "@mantine/core";
import { getSize } from "@mantine/core";

export const getTextInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TextInput: {
      defaultProps: {
        size: "md",
      },
      styles: (theme, _, { size = "md" }) => ({
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
        },
        label: {
          color: theme.fn.themeColor("text-medium"),
          fontSize: getSize({ size, sizes: theme.fontSizes }),
        },
      }),
    },
  });
