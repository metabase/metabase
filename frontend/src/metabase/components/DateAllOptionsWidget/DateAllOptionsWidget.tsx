import { useState } from "react";
import { t } from "ttag";
import cx from "classnames";

import type { DateOperator } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import DatePicker, {
  DATE_OPERATORS,
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";

import {
  WidgetRoot,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

import type { DateShortcutOptions } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

export type DateAllOptionsWidgetProps = {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
  disableOperatorSelection?: boolean;
  className?: string;
  withPadding?: boolean;
  operators?: DateOperator[];
  dateShortcutOptions?: DateShortcutOptions;
};

export const DateAllOptionsWidget = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
  className,
  withPadding = true,
  dateShortcutOptions = DATE_SHORTCUT_OPTIONS,
  operators = DATE_OPERATORS,
}: DateAllOptionsWidgetProps) => {
  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, noopRef) || [] : [],
  );

  const commitAndClose = (newFilter?: any) => {
    setValue(filterToUrlEncoded(newFilter || filter));
    onClose?.();
  };

  const isValid = () => {
    const filterValues = filter.slice(2);
    return filterValues.every((value: any) => value != null);
  };

  return (
    <WidgetRoot className={className}>
      <DatePicker
        filter={filter as any}
        onFilterChange={setFilter}
        onCommit={commitAndClose}
        hideEmptinessOperators
        disableOperatorSelection={disableOperatorSelection}
        supportsExpressions
        operators={operators}
        withPadding={withPadding}
        dateShortcutOptions={dateShortcutOptions}
      >
        <UpdateButton
          className={cx({
            disabled: !isValid(),
          })}
          onClick={() => commitAndClose()}
        >
          {t`Update filter`}
        </UpdateButton>
      </DatePicker>
    </WidgetRoot>
  );
};
