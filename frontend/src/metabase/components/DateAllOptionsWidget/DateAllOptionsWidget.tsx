import React, { useState } from "react";
import { t } from "ttag";
import cx from "classnames";

import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";

import {
  WidgetRoot,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

// Use a placeholder value as field references are not used in dashboard filters
const noopRef = null;

interface DateAllOptionsWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
  disableOperatorSelection?: boolean;
}

const DateAllOptionsWidget = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
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
    <WidgetRoot>
      <DatePicker
        filter={filter as any}
        onFilterChange={setFilter}
        onCommit={commitAndClose}
        hideTimeSelectors
        hideEmptinessOperators
        disableOperatorSelection={disableOperatorSelection}
        supportsExpressions
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateAllOptionsWidget;
