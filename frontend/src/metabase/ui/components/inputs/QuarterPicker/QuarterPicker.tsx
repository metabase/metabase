import {
  type DatePickerValue,
  MonthPicker,
  type MonthPickerProps,
  type PickerControlProps,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";
import { c } from "ttag";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps = Omit<
  MonthPickerProps,
  "monthsListFormat" | "getMonthControlProps"
> & {
  quarterListFormat?: string;
  getQuarterControlProps?: (date: Date) => Partial<PickerControlProps>;
};

export const QuarterPicker = forwardRef(function QuarterPicker(
  {
    classNames,
    value: valueProp,
    defaultValue,
    quarterListFormat = getQuarterFormat(),
    getQuarterControlProps,
    onChange,
    ...props
  }: QuarterPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useUncontrolled({
    value: valueProp,
    defaultValue,
    onChange,
  });

  return (
    <MonthPicker
      {...props}
      ref={ref}
      classNames={{
        monthsList: cx(S.monthsList, classNames?.monthsList),
        monthsListRow: cx(S.monthsListRow, classNames?.monthsListRow),
        monthsListCell: cx(S.monthsListCell, classNames?.monthsListCell),
      }}
      value={getQuarterValue(value)}
      monthsListFormat={quarterListFormat}
      onChange={setValue}
      getMonthControlProps={date => ({
        ...getMonthControlProps(date),
        ...getQuarterControlProps?.(date),
      })}
    />
  );
});

function getQuarterValue(value: DatePickerValue): DatePickerValue {
  return value ? dayjs(value).startOf("quarter").toDate() : null;
}

function getQuarterFormat() {
  return c(
    'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, and raw text can be escaped by brackets. For example, "[Quarter] Q" will be rendered as "Quarter 1".',
  ).t`[Q]Q`;
}

function getMonthControlProps(date: Date): Partial<PickerControlProps> {
  if (dayjs(date).month() !== dayjs(date).startOf("quarter").month()) {
    return { disabled: true, style: { display: "none" } };
  }
  return {};
}
