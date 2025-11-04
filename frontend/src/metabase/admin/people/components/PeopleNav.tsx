import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { UpsellSSO } from "metabase/admin/upsells";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Stack } from "metabase/ui";

export function PeopleNav() {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;

  return (
    <AdminNavWrapper justify="space-between">
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
      </Stack>
      {shouldNudge && <UpsellSSO location="people-groups-settings" />}
    </AdminNavWrapper>
  );
}

const PeopleNavItem = (props: AdminNavItemProps) => {
  const location = useSelector(getLocation);
  const subpath = location?.pathname;

  // we want to highlight the groups nav item if it's showing a details subpage
  const isActive =
    (props.path?.includes("groups") && subpath.includes(props.path)) ||
    props.path === subpath;

  return <AdminNavItem {...props} active={isActive} />;
};
