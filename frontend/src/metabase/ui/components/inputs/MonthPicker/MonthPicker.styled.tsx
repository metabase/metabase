import type { MantineThemeOverride } from "@mantine/core";
import { MonthPicker } from "@mantine/dates";

export const monthPickerOverrides: MantineThemeOverride["components"] = {
  MonthPicker: MonthPicker.extend({
    defaultProps: {
      size: "md",
      mih: 0, // overwrite Calendar's default value
    },
  }),
};
