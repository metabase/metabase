import { DatePicker } from "@mantine/dates";

import Styles from "../Calendar/Calendar.module.css";

export const datePickerOverrides = {
  DatePicker: DatePicker.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      day: Styles.day,
      weekday: Styles.weekday,
      month: Styles.month,
      monthRow: Styles.row,
      monthCell: Styles.cell,
      monthsList: Styles.monthsList,
      monthsListRow: Styles.row,
      monthsListCell: Styles.cell,
      yearsList: Styles.yearsList,
      yearsListRow: Styles.row,
      yearsListCell: Styles.cell,
      calendarHeader: Styles.calendarHeader,
      calendarHeaderLevel: Styles.calendarHeaderLevel,
      calendarHeaderControl: Styles.calendarHeaderControl,
    },
  }),
};
