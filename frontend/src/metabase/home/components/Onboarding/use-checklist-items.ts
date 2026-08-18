import { useMemo } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import { AiItem } from "metabase/home/components/Onboarding/items/AiItem";
import { AlertItem } from "metabase/home/components/Onboarding/items/AlertItem";
import { DashboardItem } from "metabase/home/components/Onboarding/items/DashboardItem";
import { DataStudioItem } from "metabase/home/components/Onboarding/items/DataStudioItem";
import { DatabaseItem } from "metabase/home/components/Onboarding/items/DatabaseItem";
import { InviteItem } from "metabase/home/components/Onboarding/items/InviteItem";
import { PermissionsItem } from "metabase/home/components/Onboarding/items/PermissionsItem";
import { QueryItem } from "metabase/home/components/Onboarding/items/QueryItem";
import type { ChecklistItemGroup } from "metabase/home/components/Onboarding/types";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";

export const useChecklistItems = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?") !== false;

  return useMemo<ChecklistItemGroup[]>(() => {
    const groups: ChecklistItemGroup[] = [];

    if (isAdmin) {
      const setupGroup: ChecklistItemGroup = {
        title: t`Set things up`,
        items: [
          { value: "database", Component: DatabaseItem },
          { value: "invite", Component: InviteItem },
          ...(areAiFeaturesEnabled
            ? [{ value: "ai" as const, Component: AiItem }]
            : []),
        ],
      };

      groups.push(setupGroup);
    }

    const exploreGroup: ChecklistItemGroup = {
      title: t`Explore your data`,
      items: [
        { value: "query", Component: QueryItem },
        { value: "dashboard", Component: DashboardItem },
        { value: "alert", Component: AlertItem },
        { value: "data-studio", Component: DataStudioItem },
        { value: "permissions", Component: PermissionsItem },
      ],
    };

    return groups.concat(exploreGroup);
  }, [isAdmin, areAiFeaturesEnabled]);
};
