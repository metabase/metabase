import moment from "moment-timezone";
import { has24HourModeSetting } from "metabase/lib/time";
import NumericInput from "metabase/components/NumericInput";
import { Icon } from "metabase/core/components/Icon";

import { AmPmLabel } from "./HoursMinutesInput.styled";

type Props = {
  hours: number;
  minutes: number;
  onChangeHours: (hours: number) => void;
  onChangeMinutes: (minutes: number) => void;

  onClear?: () => void;

  is24HourMode?: boolean;
};

const HoursMinutesInput = ({
  hours,
  minutes,
  onChangeHours,
  onChangeMinutes,
  onClear,
  is24HourMode = has24HourModeSetting(),
}: Props) => (
  <div className="flex align-center">
    <NumericInput
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={
        is24HourMode
          ? String(hours)
          : hours % 12 === 0
          ? "12"
          : String(hours % 12)
      }
      onChange={
        is24HourMode
          ? (value: number) => onChangeHours(value)
          : (value: number) => onChangeHours((hours >= 12 ? 12 : 0) + value)
      }
    />
    <span className="px1">:</span>
    <NumericInput
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={(value: number) => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className="flex align-center pl1">
        {hours < 12 ? (
          <AmPmLabel
            isSelected={hours < 12}
            onClick={() => onChangeHours(hours + 12)}
          >
            {moment.localeData().meridiem(0, 0, false)}
          </AmPmLabel>
        ) : (
          <AmPmLabel
            isSelected={hours >= 12}
            onClick={() => onChangeHours(hours - 12)}
          >
            {moment.localeData().meridiem(12, 0, false)}
          </AmPmLabel>
        )}
      </div>
    )}
    {onClear && (
      <Icon
        className="text-light cursor-pointer text-medium-hover ml-auto"
        name="close"
        onClick={onClear}
      />
    )}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HoursMinutesInput;
