import { t } from "ttag";

import { NudgeToPro } from "metabase/admin/people/components/NudgeToPro";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { AdminNavWrapper } from "metabase/admin/settings/components/AdminNav";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import {
  Icon,
  type IconName,
  NavLink,
  type NavLinkProps,
  Stack,
} from "metabase/ui";

export function PeopleNav() {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;

  return (
    <AdminNavWrapper justify="space-between">
      <Stack gap="xs">
        <SettingsNavItem path="people" label={t`People`} icon="person" />
        <SettingsNavItem path="people/groups" label={t`Groups`} icon="group" />
      </Stack>
      {shouldNudge && <NudgeToPro />}
    </AdminNavWrapper>
  );
}

function SettingsNavItem({
  path,
  label,
  icon,
  ...navLinkProps
}: { path: string; icon?: IconName } & Omit<NavLinkProps, "href">) {
  const location = useSelector(getLocation);
  const subpath = location?.pathname?.replace?.("/admin/", "");

  return (
    <NavLink
      component={Link}
      to={`/admin/${path}`}
      defaultOpened={subpath.includes(path)}
      active={path === subpath}
      variant="admin-nav"
      label={label}
      {...(icon ? { leftSection: <Icon name={icon} /> } : undefined)}
      {...navLinkProps}
    />
  );
}
