import { t } from "ttag";

import {
  AdminNavLink,
  AdminNavListItem,
} from "metabase/nav/components/AdminNavbar/AdminNavLink";

const PATH = "/admin/introspector";

interface Props {
  currentPath: string;
}

export function IntrospectorNavItem({ currentPath }: Props) {
  return (
    <AdminNavListItem path={PATH} currentPath={currentPath}>
      <AdminNavLink to={PATH} isSelected={currentPath.startsWith(PATH)}>
        {t`Introspector`}
      </AdminNavLink>
    </AdminNavListItem>
  );
}
