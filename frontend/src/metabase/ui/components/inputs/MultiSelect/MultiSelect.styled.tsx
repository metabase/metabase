import type { MantineThemeOverride } from "@mantine/core";

export const getMultiSelectOverrides =
  (): MantineThemeOverride["components"] => ({
    MultiSelect: {
      defaultProps: {
        dropdownComponent: "div",
        withinPortal: true,
      },
      styles: theme => ({
        wrapper: {
          position: "relative",
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
          "&:has(input:disabled)": {
            pointerEvents: "auto",
          },
        },
      }),
    },
  });
