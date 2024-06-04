import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  ActualModelFilters,
  AvailableModelFilters,
} from "metabase/browse/utils";
import { useUserSetting } from "metabase/common/hooks";

export const availableModelFilters: AvailableModelFilters = {
  onlyShowVerifiedModels: {
    predicate: model => model.moderated_status === "verified",
    activeByDefault: true,
  },
};

export const useModelFilterSettings = (): [
  ActualModelFilters,
  Dispatch<SetStateAction<ActualModelFilters>>,
] => {
  const [initialVerifiedFilterStatus] = useUserSetting(
    "browse-filter-only-verified-models",
    { shouldRefresh: false },
  );
  const initialModelFilters = useMemo(
    () => ({
      onlyShowVerifiedModels: initialVerifiedFilterStatus ?? false,
    }),
    [initialVerifiedFilterStatus],
  );

  const [actualModelFilters, setActualModelFilters] =
    useState<ActualModelFilters>(initialModelFilters);

  useEffect(() => {
    setActualModelFilters(initialModelFilters);
  }, [initialModelFilters, setActualModelFilters]);

  return [actualModelFilters, setActualModelFilters];
};
