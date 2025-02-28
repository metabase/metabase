import type { MantineThemeOverride } from "@mantine/core";
import { MonthPicker } from "@mantine/dates";

import CalendarS from "../Calendar/Calendar.module.css";

import S from "./MonthPicker.module.css";

export const monthPickerOverrides: MantineThemeOverride["components"] = {
  MonthPicker: MonthPicker.extend({
    defaultProps: {
      size: "md",
      mih: 0, // overwrite Calendar's default value
    },
    classNames: {
      levelsGroup: S.levelsGroup,
      calendarHeader: S.calendarHeader,
      monthsList: CalendarS.monthsList,
      calendarHeaderLevel: CalendarS.calendarHeaderLevel,
      calendarHeaderControl: CalendarS.calendarHeaderControl,
      monthsListCell: CalendarS.cell,
      monthsListRow: CalendarS.row,
      monthsListControl: CalendarS.monthsListControl,
      calendarHeaderControlIcon: S.calendarHeaderControlIcon,
    },
  }),
};
