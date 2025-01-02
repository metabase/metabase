import type { MantineThemeOverride } from "@mantine/core";

export const getMonthPickerOverrides =
  (): MantineThemeOverride["components"] => ({
    MonthPicker: {
      defaultProps: {
        size: "md",
        mih: 0, // overwrite Calendar's default value
      },
      styles: () => ({
        pickerControl: THEMED_STYLE,
        calendarHeaderLevel: THEMED_STYLE,
        calendarHeaderControl: THEMED_STYLE,
      }),
    },
  });

const THEMED_STYLE = {
  color: "var(--mb-color-text-primary)",
  "&[data-selected]": {
    color: "var(--mb-color-text-selected)",
    backgroundColor: "var(--mb-color-background-selected)",
  },
  "&[data-selected]:hover, &:hover": {
    color: "var(--mb-color-text-hover)",
    backgroundColor: "var(--mb-color-background-hover)",
  },
};
