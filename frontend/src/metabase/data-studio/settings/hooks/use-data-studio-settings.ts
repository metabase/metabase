import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

import type { DataStudioSetting } from "../types";

export function useDataStudioSettings(): DataStudioSetting[] {
  const isAdmin = useSelector(getUserIsAdmin);
  const isTransformsSetupComplete = useSetting("transforms-setup-complete");
  const areTransformsEnabled = useSetting("transforms-enabled");

  const settings: DataStudioSetting[] = [];

  if (isAdmin && isTransformsSetupComplete) {
    settings.push({
      key: "transforms-enabled",
      value: areTransformsEnabled,
      name: t`Transforms`,
      description: t`When enabled, data analysts and admins can write, schedule and run transforms.
Disabling this feature will hide all transform features, prevent transform editing or creation, and prevent any new runs.`,
    });
  }

  return settings;
}
