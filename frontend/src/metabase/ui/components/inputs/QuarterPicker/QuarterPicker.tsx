import { MonthPicker, type MonthPickerProps } from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps = MonthPickerProps;

export const QuarterPicker = forwardRef(function QuarterPicker(
  { classNames, value: valueProp, onChange, ...props }: QuarterPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useUncontrolled({
    value: valueProp,
    onChange,
  });

  return (
    <MonthPicker
      {...props}
      ref={ref}
      classNames={{
        monthsList: cx(S.monthsList, classNames?.monthsList),
        monthsListCell: cx(S.monthsListCell, classNames?.monthsListCell),
      }}
      value={value ? getStartOfQuarter(value) : null}
      monthsListFormat="[Q]Q"
      onChange={setValue}
    />
  );
});

function getStartOfQuarter(value: Date) {
  return dayjs(value).startOf("quarter").toDate();
}
