import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { shouldShowTenantsUpsell } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";

import { PeopleNav } from "../../components/PeopleNav";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
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
      {children}
    </AdminSettingsLayout>
  );
};
