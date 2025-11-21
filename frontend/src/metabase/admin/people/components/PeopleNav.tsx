import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { UpsellSSO } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Stack } from "metabase/ui";

export function PeopleNav() {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;
  const tenantEnabled = useSetting("use-tenants");

  return (
    <AdminNavWrapper justify="space-between" aria-label="people-nav">
      <Stack gap="xs">
        <PeopleNavItem
          path="/admin/people"
          data-testid="nav-item"
          label={t`People`}
          icon="person"
        />
        <PeopleNavItem
          path="/admin/people/groups"
          data-testid="nav-item"
          label={t`Groups`}
          icon="group"
        />
        {tenantEnabled && (
          <>
            <Divider my="sm" />
            <PeopleNavItem
              path="/admin/tenants"
              data-testid="nav-item-tenants"
              label={t`Tenants`}
              icon="globe"
            />
            <PeopleNavItem
              path="/admin/tenants/groups"
              data-testid="nav-item-tenant-groups"
              label={t`Tenant Groups`}
              icon="group"
            />
            <PeopleNavItem
              path="/admin/tenants/people"
              data-testid="nav-item-external-users"
              label={t`External Users`}
              icon="person"
            />
          </>
        )}
      </Stack>
      {shouldNudge && <UpsellSSO location="people-groups-settings" />}
    </AdminNavWrapper>
  );
}

export const PeopleNavItem = (props: AdminNavItemProps) => {
  const location = useSelector(getLocation);
  const subpath = location?.pathname;

  // we want to highlight the groups nav item if it's showing a details subpage
  const isActive =
    (props.path?.includes("groups") && subpath.includes(props.path)) ||
    props.path === subpath;

  return <AdminNavItem {...props} active={isActive} />;
};
