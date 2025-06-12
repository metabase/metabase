import { t } from "ttag";

import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/settings/components/AdminNav";
import { UpsellSSO } from "metabase/admin/upsells";
import { useSelector } from "metabase/lib/redux";
import { Stack } from "metabase/ui";

export function PeopleNav() {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;

  return (
    <AdminNavWrapper justify="space-between">
      <Stack gap="xs">
        <AdminNavItem
          path="/admin/people"
          data-testid="nav-item"
          label={t`People`}
          icon="person"
        />
        <AdminNavItem
          path="/admin/people/groups"
          data-testid="nav-item"
          label={t`Groups`}
          icon="group"
        />
      </Stack>
      {shouldNudge && <UpsellSSO source="people-groups-settings" />}
    </AdminNavWrapper>
  );
}
