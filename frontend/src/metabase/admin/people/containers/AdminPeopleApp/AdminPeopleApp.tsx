import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { shouldShowTenantsUpsell } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/redux";
import { Outlet } from "metabase/router";
import { getLocation } from "metabase/selectors/routing";

import { PeopleNav } from "../../components/PeopleNav";

export const AdminPeopleApp = () => {
  const location = useSelector(getLocation);
  const showTenantsUpsell = useSelector(shouldShowTenantsUpsell);
  const isTenantsRoute = location?.pathname.startsWith("/admin/people/tenants");
  const isFullWidth = showTenantsUpsell && isTenantsRoute;

  return (
    <AdminSettingsLayout
      sidebar={<PeopleNav />}
      maw="80rem"
      fullWidth={isFullWidth}
    >
      <Outlet />
    </AdminSettingsLayout>
  );
};
