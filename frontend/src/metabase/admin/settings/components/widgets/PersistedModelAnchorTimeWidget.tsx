import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import moment, { Moment } from "moment";

import TimeInput from "metabase/core/components/TimeInput";

import { has24HourModeSetting } from "metabase/lib/time";

type Props = {
  setting: {
    key: string;
    value: string | null;
    default: string;
  };
  onChange: (anchor: string) => void;
};

function formatTime(value: number) {
  return value < 10 ? `0${value}` : value;
}

function PersistedModelAnchorTimeWidget({ setting, onChange }: Props) {
  const anchor = setting.value || setting.default;
  const [hours, minutes] = anchor.split(":").map(value => parseInt(value, 10));
  const value = moment({ hours, minutes });

  const onChangeDebounced = useMemo(() => _.debounce(onChange, 300), [
    onChange,
  ]);

  const handleChange = useCallback(
    (value: Moment) => {
      const hours = value.hours();
      const minutes = value.minutes();
      const nextAnchor = `${formatTime(hours)}:${formatTime(minutes)}`;
      onChangeDebounced(nextAnchor);
    },
    [onChangeDebounced],
  );

  return (
    <TimeInput.Compact
      value={value}
      is24HourMode={has24HourModeSetting()}
      onChange={handleChange}
    />
  );
}

export default PersistedModelAnchorTimeWidget;
