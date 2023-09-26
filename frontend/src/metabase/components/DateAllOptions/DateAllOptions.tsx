import { useState } from "react";
import { t } from "ttag";
import cx from "classnames";

import type { DateOperator } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import DatePicker, {
  DATE_OPERATORS,
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";

import { UpdateButton } from "metabase/parameters/components/widgets/Widget.styled";

import type { DateShortcutOptions } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

export interface DateAllOptionsProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose?: () => void;
  disableOperatorSelection?: boolean;
  className?: string;
  operators?: DateOperator[];
  dateShortcutOptions?: DateShortcutOptions;
}

export const DateAllOptions = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
  className,
  dateShortcutOptions = DATE_SHORTCUT_OPTIONS,
  operators = DATE_OPERATORS,
}: DateAllOptionsProps) => {
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
    <DatePicker
      data-testid="date-all-options"
      className={className}
      filter={filter as any}
      onFilterChange={setFilter}
      onCommit={commitAndClose}
      hideEmptinessOperators
      disableOperatorSelection={disableOperatorSelection}
      supportsExpressions
      operators={operators}
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
  );
};
