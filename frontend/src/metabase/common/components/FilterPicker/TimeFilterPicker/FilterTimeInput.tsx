import type { ChangeEvent } from "react";
import { useCallback } from "react";
import moment from "moment";

import type { TimeInputProps } from "metabase/ui";
import { TimeInput } from "metabase/ui";

interface FilterTimeInputProps
  extends Omit<TimeInputProps, "value" | "onChange"> {
  value: Date;
  onChange: (value: Date) => void;
}

const TIME_FORMAT = "HH:mm";

export function FilterTimeInput({
  value,
  onChange,
  ...props
}: FilterTimeInputProps) {
  const inputValue = moment(value).format(TIME_FORMAT);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const date = moment(event.target.value, TIME_FORMAT, true).toDate();
      onChange(date);
    },
    [onChange],
  );

  return <TimeInput {...props} value={inputValue} onChange={handleChange} />;
}
