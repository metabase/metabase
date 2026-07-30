import { useMemo } from "react";
import { t } from "ttag";

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
import { getUserIsAdmin } from "metabase/selectors/user";
import { useSetting } from "metabase/settings";

export const useChecklistItems = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const areAiFeaturesEnabled = useSetting("ai-features-enabled?") !== false;

  return useMemo<ChecklistItemGroup[]>(() => {
    const groups: ChecklistItemGroup[] = [];

    if (isAdmin) {
      const adminGroup: ChecklistItemGroup = {
        key: "1",
        title: t`Set things up`,
        items: [
          { key: "database", Component: DatabaseItem },
          { key: "invite", Component: InviteItem },
        ],
      };

      if (areAiFeaturesEnabled) {
        adminGroup.items.push({ key: "ai", Component: AiItem });
      }

      groups.push(adminGroup);
    }

    groups.push({
      key: "2",
      title: t`Explore your data`,
      items: [
        { key: "query", Component: QueryItem },
        { key: "dashboard", Component: DashboardItem },
        { key: "alert", Component: AlertItem },
        { key: "data-studio", Component: DataStudioItem },
        { key: "permissions", Component: PermissionsItem },
      ],
    });

    return groups;
  }, [isAdmin, areAiFeaturesEnabled]);
};
