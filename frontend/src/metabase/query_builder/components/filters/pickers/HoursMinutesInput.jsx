import React from "react";

import NumericInput from "metabase/components/NumericInput";
import Icon from "metabase/components/Icon";
import { isLocale24Hour } from "metabase/lib/i18n";

import cx from "classnames";
import moment from "moment";

const HoursMinutesInput = ({
  hours,
  minutes,
  onChangeHours,
  onChangeMinutes,
  onClear,
  is24HourMode = isLocale24Hour(),
}) => (
  <div className="flex align-center">
    <NumericInput
      className="input"
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
      className="input"
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={value => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className="flex align-center pl1">
        <span
          className={cx("text-purple-hover mr1", {
            "text-purple": hours < 12,
            "cursor-pointer": hours >= 12,
          })}
          onClick={hours >= 12 ? () => onChangeHours(hours - 12) : null}
        >
          {moment.localeData().meridiem(0)}
        </span>
        <span
          className={cx("text-purple-hover mr1", {
            "text-purple": hours >= 12,
            "cursor-pointer": hours < 12,
          })}
          onClick={hours < 12 ? () => onChangeHours(hours + 12) : null}
        >
          {moment.localeData().meridiem(12)}
        </span>
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
