import React from "react";

import { has24HourModeSetting } from "metabase/lib/time";
import NumericInput from "metabase/components/NumericInput";
import Icon from "metabase/components/Icon";

import cx from "classnames";
import moment from "moment";

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
          ? (value: number) => onChangeHours(value)
          : (value: number) => onChangeHours((hours >= 12 ? 12 : 0) + value)
      }
    />
    <span className="px1">:</span>
    <NumericInput
      className="input"
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={(value: number) => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className="flex align-center pl1">
        <span
          className={cx("text-purple-hover mr1", {
            "text-purple text-heavy": hours < 12,
            "cursor-pointer": hours >= 12,
          })}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          onClick={hours >= 12 ? () => onChangeHours(hours - 12) : null}
        >
          {moment.localeData().meridiem(0, 0, false)}
        </span>
        <span
          className={cx("text-purple-hover mr1", {
            "text-purple text-heavy": hours >= 12,
            "cursor-pointer": hours < 12,
          })}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          onClick={hours < 12 ? () => onChangeHours(hours + 12) : null}
        >
          {moment.localeData().meridiem(12, 0, false)}
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
