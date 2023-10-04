/* eslint-disable react/prop-types */
import moment from "moment-timezone";
import { has24HourModeSetting } from "metabase/lib/time";
import NumericInput from "metabase/components/NumericInput";
import { Icon } from "metabase/core/components/Icon";

import { AmPmLabel } from "./HoursMinutesInput.styled";

const HoursMinutesInput = ({
  hours,
  minutes,
  onChangeHours,
  onChangeMinutes,
  onClear,
  is24HourMode = has24HourModeSetting(),
}) => (
  <div className="flex align-center">
    <NumericInput
      data-testid="hours-input"
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
          ? value => onChangeHours(value)
          : value => onChangeHours((hours >= 12 ? 12 : 0) + value)
      }
    />
    <span className="px1">:</span>
    <NumericInput
      data-testid="minutes-input"
      className="input"
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={value => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className="flex align-center pl1">
        <AmPmLabel
          isSelected={hours < 12}
          onClick={hours >= 12 ? () => onChangeHours(hours - 12) : null}
        >
          {moment.localeData().meridiem(0)}
        </AmPmLabel>
        <AmPmLabel
          isSelected={hours >= 12}
          onClick={hours < 12 ? () => onChangeHours(hours + 12) : null}
        >
          {moment.localeData().meridiem(12)}
        </AmPmLabel>
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

export default HoursMinutesInput;
