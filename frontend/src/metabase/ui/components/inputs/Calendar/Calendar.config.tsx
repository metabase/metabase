import type {
  CalendarFactory,
  CalendarHeaderFactory,
  DayFactory,
  MonthFactory,
  MonthLevelFactory,
  MonthsListFactory,
  PickerControlFactory,
  WeekdaysRowFactory,
  YearsListFactory,
} from "@mantine/dates";

import { themeComponent } from "../../../utils/theme-component";

import Styles from "./Calendar.module.css";

export const calendarOverrides = {
  Calendar: themeComponent<CalendarFactory>({
    defaultProps: {
      /**
       * Months have different number of day rows (4, 5 or 6). This causes date picker height to change when
       * navigating between months, and the "next" & "previous" buttons will shift their positions (metabase#39487).
       * This value should be the same as the default height of the calendar when 6 day rows are displayed.
       */
      mih: 314,
    },
  }),
  Day: themeComponent<DayFactory>({
    classNames: {
      day: Styles.day,
    },
  }),
  WeekdaysRow: themeComponent<WeekdaysRowFactory>({
    classNames: {
      weekday: Styles.weekday,
    },
  }),
  PickerControl: themeComponent<PickerControlFactory>({
    classNames: {
      pickerControl: Styles.pickerControl,
    },
  }),
  Month: themeComponent<MonthFactory>({
    classNames: {
      month: Styles.month,
      monthRow: Styles.row,
      monthCell: Styles.cell,
    },
  }),
  MonthsList: themeComponent<MonthsListFactory>({
    classNames: {
      monthsList: Styles.monthsList,
      monthsListRow: Styles.row,
      monthsListCell: Styles.cell,
    },
  }),
  YearsList: themeComponent<YearsListFactory>({
    classNames: {
      yearsList: Styles.yearsList,
      yearsListRow: Styles.row,
      yearsListCell: Styles.cell,
    },
  }),
  CalendarHeader: themeComponent<CalendarHeaderFactory>({
    classNames: {
      calendarHeader: Styles.calendarHeader,
      calendarHeaderLevel: Styles.calendarHeaderLevel,
      calendarHeaderControl: Styles.calendarHeaderControl,
    },
  }),
  MonthLevel: themeComponent<MonthLevelFactory>({
    classNames: {
      calendarHeader: Styles.calendarHeader,
    },
  }),
};
