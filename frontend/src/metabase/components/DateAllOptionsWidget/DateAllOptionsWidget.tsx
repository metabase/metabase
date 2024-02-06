import { useState } from "react";
import cx from "classnames";

import DatePicker from "metabase/admin/datamodel/components/filters/pickers/DatePicker/DatePicker";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";

import {
  WidgetRoot,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

import { getUpdateButtonProps } from "metabase/parameters/components/widgets/getUpdateButtonProps";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

interface DateAllOptionsWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  onClose: () => void;
  disableOperatorSelection?: boolean;
}

export const DateAllOptionsWidget = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
  defaultValue,
  required = false,
}: DateAllOptionsWidgetProps) => {
  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, noopRef) || [] : [],
  );

  const commitAndClose = (newFilter?: any) => {
    setValue(filterToUrlEncoded(newFilter || filter));
    onClose?.();
  };

  const isValid = filter.slice(2).every((value: any) => value != null);

  const unsavedValue = filterToUrlEncoded(filter);
  const { label: buttonLabel, disabled: buttonDisabled } = getUpdateButtonProps(
    value,
    unsavedValue,
    defaultValue,
    required,
  );

  return (
    <WidgetRoot>
      <DatePicker
        filter={filter}
        onFilterChange={setFilter}
        onCommit={commitAndClose}
        hideEmptinessOperators
        disableOperatorSelection={disableOperatorSelection}
        supportsExpressions
      >
        <UpdateButton
          disabled={buttonDisabled || !isValid}
          className={cx({
            disabled: !isValid,
          })}
          onClick={() => commitAndClose()}
        >
          {buttonLabel}
        </UpdateButton>
      </DatePicker>
    </WidgetRoot>
  );
};
