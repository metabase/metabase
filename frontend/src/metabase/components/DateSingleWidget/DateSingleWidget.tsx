import React from "react";

import moment from "moment";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";
import { formatSingleWidget } from "metabase/parameters/utils/date-formatting";

interface DateSingleWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
}

const DateSingleWidget = ({ value, ...props }: DateSingleWidgetProps) => {
  const defaultedValue = value == null ? moment().format("YYYY-MM-DD") : value;
  return (
    <DateAllOptionsWidget
      {...props}
      value={defaultedValue}
      disableOperatorSelection
    />
  );
};

DateSingleWidget.format = formatSingleWidget;

export default DateSingleWidget;
