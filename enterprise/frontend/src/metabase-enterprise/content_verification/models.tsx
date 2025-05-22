import { useCallback } from "react";

import type {
  ModelFilterControlsProps,
  ModelFilterSettings,
} from "metabase/browse/models";
import { useUserSetting } from "metabase/common/hooks";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { VerifiedToggle } from "./VerifiedFilter/VerifiedToggle";

const USER_SETTING_KEY = "browse-filter-only-verified-models";

export function getDefaultModelFilters(state: State): ModelFilterSettings {
  return {
    verified: getSetting(state, USER_SETTING_KEY) ?? false,
  };
}

// This component is similar to the MetricFilterControls component from ./MetricFilterControls.tsx
// merging them might be a good idea in the future.
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
    />
  );
};
