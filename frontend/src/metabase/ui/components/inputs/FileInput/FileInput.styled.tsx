import type { MantineThemeOverride } from "@mantine/core";

export const getFileInputOverrides =
  (): MantineThemeOverride["components"] => ({
    FileInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        wrapper: {
          marginTop: theme.spacing.xs,
        },
      }),
    },
  });
