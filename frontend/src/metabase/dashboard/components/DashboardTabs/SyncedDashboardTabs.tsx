import type { Location } from "history";
import { useMount } from "react-use";

import { initTabs } from "metabase/dashboard/actions";
import {
  parseSlug,
  useSyncURLSlug,
} from "metabase/dashboard/components/DashboardTabs/use-sync-url-slug";
import { useDispatch } from "metabase/lib/redux";

import type { DashboardTabsProps } from "./DashboardTabs";
import { DashboardTabs } from "./DashboardTabs";

export function SyncedDashboardTabs({
  dashboardId,
  location,
  isEditing = false,
  className,
}: DashboardTabsProps & {
  location: Location;
}) {
  const dispatch = useDispatch();

  useSyncURLSlug({ location });
  useMount(() => dispatch(initTabs({ slug: parseSlug({ location }) })));

  return (
    <DashboardTabs
      dashboardId={dashboardId}
      isEditing={isEditing}
      className={className}
    />
  );
}
