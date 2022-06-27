import React, { useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { dateParameterValueToMBQL } from "metabase/parameters/utils/mbql";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";

import {
  WidgetRoot,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

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

export default DateAllOptionsWidget;
