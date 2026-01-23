import { useClickOutside } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon } from "metabase/ui";
import type { AdminPath } from "metabase-types/store";

import { ProfileLink } from "../ProfileLink/ProfileLink";
import StoreLink from "../StoreLink";

import { AdminNavItem } from "./AdminNavItem";
import { AdminNavLink } from "./AdminNavItem.styled";
import AdminNavCS from "./AdminNavbar.module.css";
import {
  AdminButtons,
  AdminLogoContainer,
  AdminLogoLink,
  AdminLogoText,
  AdminMobileNavBarItems,
  AdminMobileNavbar,
  AdminNavbarItems,
  AdminNavbarRoot,
  MobileHide,
} from "./AdminNavbar.styled";

interface AdminNavbarProps {
  path: string;
  adminPaths: AdminPath[];
}

export const AdminNavbar = ({
  path: currentPath,
  adminPaths,
}: AdminNavbarProps) => {
  const isPaidPlan = useSelector(getIsPaidPlan);
  const isAdmin = useSelector(getUserIsAdmin);
  const dispatch = useDispatch();

  useRegisterShortcut(
    [
      {
        id: "admin-change-tab",
        perform: (_, event) => {
          if (!event?.key) {
            return;
          }
          const key = parseInt(event.key);
          const path = adminPaths[key - 1]?.path;

          if (path) {
            dispatch(push(path));
          }
        },
      },
    ],
    [adminPaths],
  );

  return (
    <AdminNavbarRoot
      data-element-id="navbar-root"
      data-testid="admin-navbar"
      aria-label={t`Navigation bar`}
    >
      <AdminLogoLink to="/admin">
        <AdminLogoContainer>
          <LogoIcon className={cx(CS.textBrand, CS.my2)} dark />
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
          <AdminLogoText>{t`Metabase Admin`}</AdminLogoText>
        </AdminLogoContainer>
      </AdminLogoLink>

      <MobileNavbar adminPaths={adminPaths} currentPath={currentPath} />

      <MobileHide>
        <AdminNavbarItems data-testid="admin-navbar-items">
          {adminPaths.map(({ name, key, path }) => (
            <AdminNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </AdminNavbarItems>

        {!isPaidPlan && isAdmin && <StoreLink />}

        <AdminButtons>
          <ProfileLink />
        </AdminButtons>
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

  const ref = useClickOutside(() => setMobileNavOpen(false));

  return (
    <AdminMobileNavbar ref={ref}>
      <Button
        onClick={() => setMobileNavOpen((prev) => !prev)}
        variant="subtle"
        p="0.25rem"
        leftSection={
          <Icon
            name="burger"
            size={32}
            className={AdminNavCS.MobileHamburgerIcon}
          />
        }
      />
      <ProfileLink />

      {mobileNavOpen && (
        <AdminMobileNavBarItems aria-label={t`Navigation links`}>
          {adminPaths.map(({ name, key, path }) => (
            <AdminNavLink
              to={path}
              key={key}
              isSelected={currentPath.startsWith(path)}
              isInMobileNav
            >
              {name}
            </AdminNavLink>
          ))}
        </AdminMobileNavBarItems>
      )}
    </AdminMobileNavbar>
  );
};
