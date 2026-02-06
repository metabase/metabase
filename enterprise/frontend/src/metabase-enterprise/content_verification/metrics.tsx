import { useCallback } from "react";
import { t } from "ttag";

import type {
  MetricFilterControlsProps,
  MetricFilterSettings,
} from "metabase/browse/metrics";
import { useUserSetting } from "metabase/common/hooks";
import { getSetting } from "metabase/selectors/settings";
import { createSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import { VerifiedToggle } from "./VerifiedFilter/VerifiedToggle";

const USER_SETTING_KEY = "browse-filter-only-verified-metrics";

export const getDefaultMetricFilters = createSelector(
  (state: State) => getSetting(state, USER_SETTING_KEY),
  (verified): MetricFilterSettings => ({
    verified: verified ?? false,
  }),
);

/**
 * This was originally designed to support multiple filters but it currently
 * just supports one.
 *
 * The "Browse models" page has a similar component
 */
export const MetricFilterControls = ({
  metricFilters,
  setMetricFilters,
}: MetricFilterControlsProps) => {
  const [_userSetting, setUserSetting] = useUserSetting(USER_SETTING_KEY);

  const handleVerifiedFilterChange = useCallback(
    function (verified: boolean) {
      setMetricFilters({ ...metricFilters, verified });
      setUserSetting(verified);
    },
    [metricFilters, setMetricFilters, setUserSetting],
  );

  const { verified } = metricFilters;

  return (
    <VerifiedToggle
      verified={verified}
      handleVerifiedFilterChange={handleVerifiedFilterChange}
      labelWhenOn={t`Show unverified metrics, too`}
      labelWhenOff={t`Only show verified metrics`}
    />
  );
};
