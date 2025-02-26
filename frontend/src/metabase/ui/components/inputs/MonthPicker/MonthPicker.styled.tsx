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
      monthsList: CalendarS.monthsList,
      yearsList: CalendarS.yearsList,
      yearsListRow: CalendarS.row,
      yearsListCell: CalendarS.cell,
      calendarHeader: S.calendarHeader,
      calendarHeaderLevel: CalendarS.calendarHeaderLevel,
      calendarHeaderControl: CalendarS.calendarHeaderControl,
      monthsListControl: S.monthsListControl,
      monthsListCell: S.monthsListCell,
      monthsListRow: S.monthsListRow,
    },
  }),
};
