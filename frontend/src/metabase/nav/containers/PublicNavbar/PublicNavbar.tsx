import React, { useState, useEffect } from "react";
import { t } from "ttag";
import { PublicNavItem } from "./PublicNavItem";
import LogoIcon from "metabase/components/LogoIcon";
import Icon from "metabase/components/Icon";
import {
  PublicLogoContainer,
  PublicLogoLink,
  PublicLogoText,
  PublicNavbarItems,
  PublicNavbarRoot,
  AdminMobileNavbar,
  AdminMobileNavBarItems,
  MobileHide,
} from "./PublicNavbar.styled";
import { AdminPath } from "metabase-types/store";

interface AdminNavbarProps {
  path: string;
  publicNavPaths: [];
}

export const PublicNavbar = ({
  path: currentPath,
  publicNavPaths,
}: AdminNavbarProps) => {
  return (
    <PublicNavbarRoot className="Nav">
      <PublicLogoLink
        to="/public/dashboard/1d797208-ea63-4c7b-b276-dc68315bc705"
        data-metabase-event="Navbar;Logo"
      >
        <PublicLogoContainer>
          <LogoIcon className="text-brand my2" dark />
          <PublicLogoText>{t`NFTRover`}</PublicLogoText>
        </PublicLogoContainer>
      </PublicLogoLink>

      <MobileNavbar adminPaths={publicNavPaths} currentPath={currentPath} />

      <MobileHide>
        <PublicNavbarItems>
          {publicNavPaths.map(({ name, key, path }) => (
            <PublicNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </PublicNavbarItems>
      </MobileHide>
    </PublicNavbarRoot>
  );
};

interface AdminMobileNavbarProps {
  adminPaths: [];
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
        size={20}
        onClick={() => setMobileNavOpen(prev => !prev)}
      />
      {mobileNavOpen && (
        <AdminMobileNavBarItems>
          {adminPaths.map(({ name, key, path }) => (
            <PublicNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </AdminMobileNavBarItems>
      )}
    </AdminMobileNavbar>
  );
};
