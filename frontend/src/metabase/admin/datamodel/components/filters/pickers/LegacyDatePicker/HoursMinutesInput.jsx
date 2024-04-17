/* eslint-disable react/prop-types */
import cx from "classnames";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import NumericInput from "metabase/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { has24HourModeSetting } from "metabase/lib/time";
import { Icon } from "metabase/ui";

import { AmPmLabel } from "./HoursMinutesInput.styled";

const HoursMinutesInput = ({
  hours,
  minutes,
  onChangeHours,
  onChangeMinutes,
  onClear,
  is24HourMode = has24HourModeSetting(),
}) => (
  <div className={cx(CS.flex, CS.alignCenter)}>
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
    <span className={CS.px1}>:</span>
    <NumericInput
      data-testid="minutes-input"
      className={CS.input}
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={value => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className={cx(CS.flex, CS.alignCenter, CS.pl1)}>
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
        className={cx(
          CS.textLight,
          CS.cursorPointer,
          CS.textMediumHover,
          CS.mlAuto,
        )}
        name="close"
        onClick={onClear}
      />
    )}
  </div>
);

export default HoursMinutesInput;
