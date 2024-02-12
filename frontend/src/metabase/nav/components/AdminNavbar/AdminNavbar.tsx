/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from "react";
import { t } from "ttag";

import LogoIcon from "metabase/components/LogoIcon";
import { Icon } from "metabase/core/components/Icon";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { Button } from "metabase/ui";
import type { User } from "metabase-types/api";
import type { AdminPath } from "metabase-types/store";

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
  FlexColumnContainer,
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
  const adminPathsFiltered = adminPaths.filter(
    path => path.key !== "troubleshooting" && path.key !== "permissions",
  );

  return (
    <AdminNavbarRoot className="Nav" aria-label={t`Navigation bar`}>
      <AdminLogoLink to="/admin" data-metabase-event="Navbar;Logo">
        <AdminLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <FlexColumnContainer>
            <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
            <AdminLogoText>Accelerated By Dadosfera</AdminLogoText>
          </FlexColumnContainer>
        </AdminLogoContainer>
      </AdminLogoLink>

      <MobileNavbar adminPaths={adminPathsFiltered} currentPath={currentPath} />

      <MobileHide>
        <AdminNavbarItems>
          {adminPathsFiltered.map(({ name, key, path }) => (
            <AdminNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </AdminNavbarItems>

        {/* {!isPaidPlain && <StoreLink />} */}

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
      <Button
        onClick={() => setMobileNavOpen(prev => !prev)}
        variant="subtle"
        p="0.25rem"
      >
        <Icon name="burger" size={32} color="white" />
      </Button>
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
