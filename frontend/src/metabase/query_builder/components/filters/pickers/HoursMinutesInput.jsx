import React from "react";

import NumericInput from "metabase/components/NumericInput.jsx";
import Icon from "metabase/components/Icon";

import cx from "classnames";

const HoursMinutesInput = ({
  hours,
  minutes,
  onChangeHours,
  onChangeMinutes,
  onClear,
}) => (
  <div className="flex align-center">
    <NumericInput
      className="input"
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={hours % 12 === 0 ? "12" : String(hours % 12)}
      onChange={value => onChangeHours((hours >= 12 ? 12 : 0) + value)}
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
    <div className="flex align-center pl1">
      <span
        className={cx("text-purple-hover mr1", {
          "text-purple": hours < 12,
          "cursor-pointer": hours >= 12,
        })}
        onClick={hours >= 12 ? () => onChangeHours(hours - 12) : null}
      >
        AM
      </span>
      <span
        className={cx("text-purple-hover mr1", {
          "text-purple": hours >= 12,
          "cursor-pointer": hours < 12,
        })}
        onClick={hours < 12 ? () => onChangeHours(hours + 12) : null}
      >
        PM
      </span>
    </div>
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
