import { useCallback } from "react";
import { t } from "ttag";

import type {
  ModelFilterControlsProps,
  ModelFilterSettings,
} from "metabase/browse/models";
import { useUserSetting } from "metabase/common/hooks";
import { getSetting } from "metabase/selectors/settings";
import { createSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import { VerifiedToggle } from "./VerifiedFilter/VerifiedToggle";

const USER_SETTING_KEY = "browse-filter-only-verified-models";

export const getDefaultModelFilters = createSelector(
  (state: State) => getSetting(state, USER_SETTING_KEY),
  (verified): ModelFilterSettings => ({
    verified: verified ?? false,
  }),
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
