import type { MantineThemeOverride } from "@mantine/core";

export const getMonthPickerOverrides =
  (): MantineThemeOverride["components"] => ({
    MonthPicker: {
      defaultProps: {
        size: "md",
        mih: 0, // overwrite Calendar's default value
      },
    },
  });
