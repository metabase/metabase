import { DateInput } from "@mantine/dates";

import Styles from "../Calendar/Calendar.module.css";

export const dateInputOverrides = {
  DateInput: DateInput.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      levelsGroup: Styles.popoverWrapper, // weird name for a popover wrapper
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
