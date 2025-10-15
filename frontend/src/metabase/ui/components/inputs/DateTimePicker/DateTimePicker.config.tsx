import { DateTimePicker } from "@mantine/dates";

import CalendarStyles from "../Calendar/Calendar.module.css";

import Styles from "./DateTimePicker.module.css";

export const dateTimePickerOverrides = {
  DateTimePicker: DateTimePicker.extend({
    defaultProps: {
      size: "md",
      popoverProps: {
        styles: {
          dropdown: {
            /* Padding workaround since popover padding is overridden to zero */
            "--popover-padding": "var(--mantine-spacing-md)",
          },
        },
      },
      submitButtonProps: {
        variant: "light",
      },
    },
    classNames: {
      levelsGroup: Styles.levelsGroup,
      timeWrapper: Styles.timeWrapper,
      day: CalendarStyles.day,
      weekday: CalendarStyles.weekday,
      month: CalendarStyles.month,
      monthRow: CalendarStyles.row,
      monthCell: CalendarStyles.cell,
      monthsList: CalendarStyles.monthsList,
      monthsListRow: CalendarStyles.row,
      monthsListCell: CalendarStyles.cell,
      yearsList: CalendarStyles.yearsList,
      yearsListRow: CalendarStyles.row,
      yearsListCell: CalendarStyles.cell,
      calendarHeader: CalendarStyles.calendarHeader,
      calendarHeaderLevel: CalendarStyles.calendarHeaderLevel,
      calendarHeaderControl: CalendarStyles.calendarHeaderControl,
    },
    styles: {
      weekdaysRow: {
        boxSizing: "border-box",
      },
    },
  }),
};
