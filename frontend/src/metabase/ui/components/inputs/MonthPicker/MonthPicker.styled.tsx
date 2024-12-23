import type { MantineThemeOverride } from "@mantine/core";

export const getMonthPickerOverrides =
  (): MantineThemeOverride["components"] => ({
    MonthPicker: {
      defaultProps: {
        size: "md",
      },
    },
  });
