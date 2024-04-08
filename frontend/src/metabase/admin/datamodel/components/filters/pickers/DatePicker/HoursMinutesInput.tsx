import cx from "classnames";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import NumericInput from "metabase/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { has24HourModeSetting } from "metabase/lib/time";
import { Icon } from "metabase/ui";

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
  <div className={cx(CS.flex, CS.alignCenter)}>
    <NumericInput
      style={{ height: 36 }}
      size={2}
      maxLength={2}
      placeholder="hh"
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
    <span className={CS.px1}>:</span>
    <NumericInput
      style={{ height: 36 }}
      size={2}
      placeholder="mm"
      maxLength={2}
      value={(minutes < 10 ? "0" : "") + minutes}
      onChange={(value: number) => onChangeMinutes(value)}
    />
    {!is24HourMode && (
      <div className={cx(CS.flex, CS.alignCenter, CS.pl1)}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HoursMinutesInput;
