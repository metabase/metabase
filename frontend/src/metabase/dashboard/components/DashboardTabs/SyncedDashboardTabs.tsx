import type { Location } from "history";
import { useMount } from "react-use";

import { initTabs } from "metabase/dashboard/actions";
import type { DashboardTabsProps } from "metabase/dashboard/components/DashboardTabs/DashboardTabs";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs/DashboardTabs";
import { useDispatch } from "metabase/lib/redux";

import { parseSlug, useSyncURLSlug } from "./use-sync-url-slug";

export const SyncedDashboardTabs = ({
  dashboardId,
  location,
  isEditing = false,
  className,
}: DashboardTabsProps & {
  location: Location;
}) => {
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
};
