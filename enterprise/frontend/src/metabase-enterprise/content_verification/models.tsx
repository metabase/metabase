import { createSelector } from "@reduxjs/toolkit";
import { useCallback } from "react";
import { t } from "ttag";

import type {
  ModelFilterControlsProps,
  ModelFilterSettings,
} from "metabase/browse/models";
import { useUserSetting } from "metabase/common/hooks";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";

import { VerifiedToggle } from "./VerifiedFilter/VerifiedToggle";

const USER_SETTING_KEY = "browse-filter-only-verified-models";

// createSelector so this returns the same object reference when the
// underlying setting hasn't changed, instead of a new { verified } object
// literal on every call -- which defeated reference-equality checks
// (useSelector, downstream reselect memoization) on every unrelated state
// change.
export const getDefaultModelFilters: (state: State) => ModelFilterSettings =
  createSelector(
    (state: State) => getSetting(state, USER_SETTING_KEY),
    (verified): ModelFilterSettings => ({ verified: verified ?? false }),
  );

/**
 * This was originally designed to support multiple filters but it currently
 * just supports one.
 *
 * The Browse metrics page has a similar component
 */
export const ModelFilterControls = ({
  modelFilters,
  setModelFilters,
}: ModelFilterControlsProps) => {
  const [_userSetting, setUserSetting] = useUserSetting(USER_SETTING_KEY);

  const handleVerifiedFilterChange = useCallback(
    function (verified: boolean) {
      setModelFilters({ ...modelFilters, verified });
      setUserSetting(verified);
    },
    [modelFilters, setModelFilters, setUserSetting],
  );

  const { verified } = modelFilters;
  return (
    <VerifiedToggle
      verified={verified}
      handleVerifiedFilterChange={handleVerifiedFilterChange}
      labelWhenOn={t`Show unverified models, too`}
      labelWhenOff={t`Only show verified models`}
    />
  );
};
