import type { MantineThemeOverride } from "@mantine/core";
import { MonthPicker } from "@mantine/dates";

import Styles from "./MonthPicker.module.css";

export const monthPickerOverrides: MantineThemeOverride["components"] = {
  MonthPicker: MonthPicker.extend({
    defaultProps: {
      size: "md",
      mih: 0, // overwrite Calendar's default value
    },
    classNames: {
      levelsGroup: Styles.LevelsGroup,
      calendarHeaderLevel: Styles.CalendarHeaderLevel,
      monthsListCell: Styles.MonthListCell,
      monthsListRow: Styles.MonthListRow,
    },
  }),
};
