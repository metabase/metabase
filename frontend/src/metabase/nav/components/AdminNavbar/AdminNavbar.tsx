import React from "react";
import { t } from "ttag";
import { PLUGIN_ADMIN_NAV_ITEMS } from "metabase/plugins";
import MetabaseSettings from "metabase/lib/settings";
import { AdminNavItem } from "./AdminNavItem";
import Link from "metabase/components/Link";
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

interface AdminNavbarProps {
  path: string;
}

export const AdminNavbar = ({ path: currentPath }: AdminNavbarProps) => {
  return (
    <AdminNavbarRoot className="Nav">
      <AdminLogoLink to="/admin" data-metabase-event={"Navbar;Logo"}>
        <AdminLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
        </AdminLogoContainer>
      </AdminLogoLink>

      <AdminNavbarItems>
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
        <AdminNavItem
          name={t`Data Model`}
          path="/admin/datamodel"
          currentPath={currentPath}
          key="admin-nav-datamodel"
        />
        <AdminNavItem
          name={t`Databases`}
          path="/admin/databases"
          currentPath={currentPath}
          key="admin-nav-databases"
        />
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
      </AdminNavbarItems>

      {!MetabaseSettings.isPaidPlan() && <StoreLink />}
      <AdminExitLink
        to="/"
        data-metabase-event="Navbar;Exit Admin"
      >{t`Exit admin`}</AdminExitLink>
    </AdminNavbarRoot>
  );
};
