import { DatePickerInput } from "@mantine/dates";

import Styles from "../Calendar/Calendar.module.css";

import DatePickerInputStyles from "./DatePickerInput.module.css";

export const datePickerInputOverrides = {
  DatePickerInput: DatePickerInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    classNames: {
      levelsGroup: Styles.popoverWrapper,
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
      placeholder: DatePickerInputStyles.placeholder,
      section: DatePickerInputStyles.section,
    },
    styles: {
      levelsGroup: {
        gap: "var(--mantine-spacing-lg)",
      },
      weekdaysRow: {
        boxSizing: "border-box",
      },
    },
  }),
};
