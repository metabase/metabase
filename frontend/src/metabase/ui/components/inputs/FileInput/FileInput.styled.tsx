import type { MantineThemeOverride } from "@mantine/core";
import { FileInputValue } from "./FileInputValue";

export const getFileInputOverrides =
  (): MantineThemeOverride["components"] => ({
    FileInput: {
      defaultProps: {
        size: "md",
        valueComponent: FileInputValue,
      },
      styles: theme => ({
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
        },
      }),
    },
  });
