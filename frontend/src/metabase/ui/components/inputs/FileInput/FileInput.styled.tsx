import type { MantineThemeOverride } from "@mantine/core";
import { getSize } from "@mantine/core";

import { FileInputValue } from "./FileInputValue";

export const getFileInputOverrides =
  (): MantineThemeOverride["components"] => ({
    FileInput: {
      defaultProps: {
        size: "md",
        valueComponent: FileInputValue,
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
