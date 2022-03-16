import React from "react";
import { t } from "ttag";
import {
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import MetabaseSettings from "metabase/lib/settings";
import { AdminNavItem } from "./AdminNavItem";
import StoreLink from "../StoreLink";
import LogoIcon from "metabase/components/LogoIcon";
import {
  AdminExitLink,
  AdminLogoContainer,
  AdminLogoLink,
  AdminLogoText,
  AdminNavbarItems,
  AdminNavbarRoot,
} from "./AdminNavbar.styled";
import { User } from "metabase-types/types/User";

interface AdminNavbarProps {
  path: string;
  user: User;
}

export const AdminNavbar = ({ path: currentPath, user }: AdminNavbarProps) => {
  const isAdmin = user.is_superuser;
  const canAccessDataModel =
    isAdmin || PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(user);
  const canAccessDatabaseManagement =
    isAdmin ||
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDatabaseManagement(user);

  return (
    <AdminNavbarRoot className="Nav">
      <AdminLogoLink to="/admin" data-metabase-event={"Navbar;Logo"}>
        <AdminLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
        </AdminLogoContainer>
      </AdminLogoLink>

      <AdminNavbarItems>
        {isAdmin && (
          <>
            <AdminNavItem
              name={t`Settings`}
              path="/admin/settings"
              currentPath={currentPath}
              key="admin-nav-settings"
            />

            <AdminNavItem
              name={t`People`}
              path="/admin/people"
              currentPath={currentPath}
              key="admin-nav-people"
            />
          </>
        )}

        {canAccessDataModel && (
          <AdminNavItem
            name={t`Data Model`}
            path="/admin/datamodel"
            currentPath={currentPath}
            key="admin-nav-datamodel"
          />
        )}
        {canAccessDatabaseManagement && (
          <AdminNavItem
            name={t`Databases`}
            path="/admin/databases"
            currentPath={currentPath}
            key="admin-nav-databases"
          />
        )}

        {isAdmin && (
          <>
            <AdminNavItem
              name={t`Permissions`}
              path="/admin/permissions"
              currentPath={currentPath}
              key="admin-nav-permissions"
            />

            {PLUGIN_ADMIN_NAV_ITEMS.map(({ name, path }) => (
              <AdminNavItem
                name={name}
                path={path}
                currentPath={currentPath}
                key={`admin-nav-${name}`}
              />
            ))}

            <AdminNavItem
              name={t`Troubleshooting`}
              path="/admin/troubleshooting"
              currentPath={currentPath}
              key="admin-nav-troubleshooting"
            />
          </>
        )}
      </AdminNavbarItems>

      {!MetabaseSettings.isPaidPlan() && <StoreLink />}
      <AdminExitLink
        to="/"
        data-metabase-event="Navbar;Exit Admin"
      >{t`Exit admin`}</AdminExitLink>
    </AdminNavbarRoot>
  );
};
