import { useState, useEffect } from "react";
import { t } from "ttag";

import LogoIcon from "metabase/components/LogoIcon";
import { Icon } from "metabase/core/components/Icon";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { User } from "metabase-types/api";
import { AdminPath } from "metabase-types/store";

import StoreLink from "../StoreLink";

import { AdminNavItem } from "./AdminNavItem";
import {
  AdminExitLink,
  AdminLogoContainer,
  AdminLogoLink,
  AdminLogoText,
  AdminNavbarItems,
  AdminNavbarRoot,
  AdminMobileNavbar,
  AdminMobileNavBarItems,
  MobileHide,
} from "./AdminNavbar.styled";

interface AdminNavbarProps {
  path: string;
  user: User;
  adminPaths: AdminPath[];
}

export const AdminNavbar = ({
  path: currentPath,
  adminPaths,
}: AdminNavbarProps) => {
  const isPaidPlain = useSelector(getIsPaidPlan);

  return (
    <AdminNavbarRoot className="Nav" aria-label={t`Navigation bar`}>
      <AdminLogoLink to="/admin" data-metabase-event="Navbar;Logo">
        <AdminLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
        </AdminLogoContainer>
      </AdminLogoLink>

      <MobileNavbar adminPaths={adminPaths} currentPath={currentPath} />

      <MobileHide>
        <AdminNavbarItems>
          {adminPaths.map(({ name, key, path }) => (
            <AdminNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </AdminNavbarItems>

        {!isPaidPlain && <StoreLink />}
        <AdminExitLink
          to="/"
          data-metabase-event="Navbar;Exit Admin"
          data-testid="exit-admin"
        >{t`Exit admin`}</AdminExitLink>
      </MobileHide>
    </AdminNavbarRoot>
  );
};

interface AdminMobileNavbarProps {
  adminPaths: AdminPath[];
  currentPath: string;
}

const MobileNavbar = ({ adminPaths, currentPath }: AdminMobileNavbarProps) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (mobileNavOpen) {
      const listener = () => setMobileNavOpen(false);
      document.addEventListener("click", listener, { once: true });
      return () => document.removeEventListener("click", listener);
    }
  }, [mobileNavOpen]);

  return (
    <AdminMobileNavbar>
      <Icon
        name="burger"
        size={32}
        onClick={() => setMobileNavOpen(prev => !prev)}
      />
      {mobileNavOpen && (
        <AdminMobileNavBarItems>
          {adminPaths.map(({ name, key, path }) => (
            <AdminNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
          <AdminExitLink to="/" data-metabase-event="Navbar;Exit Admin">
            {t`Exit admin`}
          </AdminExitLink>
        </AdminMobileNavBarItems>
      )}
    </AdminMobileNavbar>
  );
};
