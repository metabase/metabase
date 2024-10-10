import {
  Calendar,
  CalendarHeader,
  Day,
  Month,
  MonthLevel,
  MonthsList,
  PickerControl,
  WeekdaysRow,
  YearsList,
} from "@mantine/dates";

import Styles from "./Calendar.module.css";

export const calendarOverrides = {
  Calendar: Calendar.extend({
    defaultProps: {
      /**
       * Months have different number of day rows (4, 5 or 6). This causes date picker height to change when
       * navigating between months, and the "next" & "previous" buttons will shift their positions (metabase#39487).
       * This value should be the same as the default height of the calendar when 6 day rows are displayed.
       */
      mih: 314,
    },
  }),
  Day: Day.extend({
    classNames: {
      day: Styles.day,
    },
  }),
  WeekdaysRow: WeekdaysRow.extend({
    classNames: {
      weekdaysRow: Styles.weekdaysRow,
    },
  }),
  PickerControl: PickerControl.extend({
    classNames: {
      pickerControl: Styles.pickerControl,
    },
  }),
  Month: Month.extend({
    classNames: {
      month: Styles.month,
      monthRow: Styles.row,
      monthCell: Styles.cell,
    },
  }),
  MonthsList: MonthsList.extend({
    classNames: {
      monthsList: Styles.monthsList,
      monthsListRow: Styles.row,
      monthsListCell: Styles.cell,
    },
  }),
  YearsList: YearsList.extend({
    classNames: {
      yearsList: Styles.yearsList,
      yearsListRow: Styles.row,
      yearsListCell: Styles.cell,
    },
  }),
  CalendarHeader: CalendarHeader.extend({
    classNames: {
      calendarHeader: Styles.calendarHeader,
      calendarHeaderLevel: Styles.calendarHeaderLevel,
      calendarHeaderControl: Styles.calendarHeaderControl,
    },
  }),
  MonthLevel: MonthLevel.extend({
    classNames: {
      calendarHeader: Styles.calendarHeader,
    },
  }),
};
