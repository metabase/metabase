import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import moment, { Moment } from "moment";
import { t } from "ttag";

import TimeInput from "metabase/core/components/TimeInput";

import { has24HourModeSetting } from "metabase/lib/time";

import { formatTime, getNextExpectedRefreshTime } from "./utils";
import { RelativeTimeLabel } from "./PersistedModelAnchorTimeWidget.styled";

const DEFAULT_REFRESH_INTERVAL = 6;

type Props = {
  setting: {
    key: string;
    value: string | null;
    default: string;
  };
  settingValues: {
    "persisted-model-refresh-interval-hours": number | null;
  };
  onChange: (anchor: string) => void;
};

function PersistedModelAnchorTimeWidget({
  setting,
  onChange,
  settingValues,
}: Props) {
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

  const nextRefreshDates = useMemo(() => {
    const refreshInterval =
      settingValues["persisted-model-refresh-interval-hours"] ||
      DEFAULT_REFRESH_INTERVAL;
    const firstRefresh = getNextExpectedRefreshTime(
      moment(),
      refreshInterval,
      anchor,
    );
    const secondRefresh = getNextExpectedRefreshTime(
      firstRefresh,
      refreshInterval,
      anchor,
    );
    const thirdRefresh = getNextExpectedRefreshTime(
      secondRefresh,
      refreshInterval,
      anchor,
    );
    return [firstRefresh, secondRefresh, thirdRefresh];
  }, [anchor, settingValues]);

  const renderRefreshTimeHintText = useCallback(() => {
    const [first, second, third] = nextRefreshDates.map(time =>
      time.fromNow(true),
    );
    return (
      <RelativeTimeLabel>{t`The next three refresh jobs will run in ${first}, ${second}, and ${third}.`}</RelativeTimeLabel>
    );
  }, [nextRefreshDates]);

  return (
    <div>
      <TimeInput.Compact
        value={value}
        is24HourMode={has24HourModeSetting()}
        onChange={handleChange}
      />
      {renderRefreshTimeHintText()}
    </div>
  );
}

export default PersistedModelAnchorTimeWidget;
