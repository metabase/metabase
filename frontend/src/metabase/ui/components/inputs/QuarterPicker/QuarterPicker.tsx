import { MonthPicker, type MonthPickerProps } from "@mantine/dates";
import cx from "classnames";
import { type Ref, forwardRef } from "react";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps = MonthPickerProps;

export const QuarterPicker = forwardRef(function QuarterPicker(
  { classNames, ...props }: QuarterPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <MonthPicker
      ref={ref}
      {...props}
      classNames={{
        monthsList: cx(S.monthsList, classNames?.monthsList),
        monthsListRow: cx(S.monthsListRow, classNames?.monthsListRow),
        monthsListCell: cx(S.monthsListCell, classNames?.monthsListCell),
        pickerControl: cx(S.pickerControl, classNames?.pickerControl),
      }}
      monthsListFormat="[Q]Q"
    />
  );
});
