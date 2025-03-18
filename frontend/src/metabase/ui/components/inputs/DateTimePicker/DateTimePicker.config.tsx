import { DateTimePicker } from "@mantine/dates";

import Styles from "../Calendar/Calendar.module.css";

export const dateTimePickerOverrides = {
  DateTimePicker: DateTimePicker.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      popoverProps: {
        classNames: {
          dropdown: Styles.popoverWrapper,
        },
      },
      submitButtonProps: {
        // Apparenty `default` variant for action button is just fully transparent button
        variant: "filled",
      },
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
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
