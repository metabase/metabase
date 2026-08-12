import type { DateInputFactory } from "@mantine/dates";

import { themeComponent } from "../../../utils/theme-component";
import Styles from "../Calendar/Calendar.module.css";

export const dateInputOverrides = {
  DateInput: themeComponent<DateInputFactory>({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
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
      monthsListControl: Styles.monthsListControl,
      yearsList: Styles.yearsList,
      yearsListRow: Styles.row,
      yearsListCell: Styles.cell,
      calendarHeader: Styles.calendarHeader,
      calendarHeaderLevel: Styles.calendarHeaderLevel,
      calendarHeaderControl: Styles.calendarHeaderControl,
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
