import moment from "moment";
import TimeInputView from "metabase/core/components/TimeInput";
import { useSelector } from "metabase/lib/redux";
import { getTimeFormat } from "metabase/selectors/settings";

export type TimeInputValue = {
  hour: number;
  minute: number;
};

export interface TimeInputProps {
  value: TimeInputValue;
  onChange: (value: TimeInputValue) => void;
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const momentValue = moment().hours(value.hour).minutes(value.minute);
  const timeFormat = useSelector(getTimeFormat);

  const handleChange = (nextMomentValue: moment.Moment) => {
    onChange({
      hour: nextMomentValue.hours(),
      minute: nextMomentValue.minutes(),
    });
  };

  return (
    <TimeInputView
      value={momentValue}
      timeFormat={timeFormat}
      hasClearButton={false}
      onChange={handleChange}
    />
  );
}
