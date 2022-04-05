import React from "react";
import { t } from "ttag";
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
import { User } from "metabase-types/api";
import { getAllowedMenuItems } from "metabase/nav/utils";

interface AdminNavbarProps {
  path: string;
  user: User;
}

export const AdminNavbar = ({ path: currentPath, user }: AdminNavbarProps) => {
  const allowedMenuItems = getAllowedMenuItems(user);

  return (
    <AdminNavbarRoot className="Nav">
      <AdminLogoLink to="/admin" data-metabase-event={"Navbar;Logo"}>
        <AdminLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
        </AdminLogoContainer>
      </AdminLogoLink>

      <AdminNavbarItems>
        {allowedMenuItems.map(({ name, key, path }) => (
          <AdminNavItem
            name={name}
            path={path}
            key={key}
            currentPath={currentPath}
          />
        ))}
      </AdminNavbarItems>

      {!MetabaseSettings.isPaidPlan() && <StoreLink />}
      <AdminExitLink
        to="/"
        data-metabase-event="Navbar;Exit Admin"
      >{t`Exit admin`}</AdminExitLink>
    </AdminNavbarRoot>
  );
};
