import type { MantineThemeOverride } from "@mantine/core";

export const getDatePickerOverrides =
  (): MantineThemeOverride["components"] => ({
    DatePicker: {
      defaultProps: {
        size: "md",
      },
    },
  });
