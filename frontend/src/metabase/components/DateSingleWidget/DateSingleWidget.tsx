import React from "react";

import moment from "moment-timezone";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";

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

export default DateSingleWidget;
