import { useClickOutside } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Flex, Icon, Stack } from "metabase/ui";
import type { AdminPath } from "metabase-types/store";

import { ADMIN_NAVBAR_HEIGHT } from "../../constants";
import { AppSwitcher } from "../AppSwitcher";
import StoreLink from "../StoreLink";

import { AdminNavItem } from "./AdminNavItem";
import AdminNavItemS from "./AdminNavItem.module.css";
import S from "./AdminNavbar.module.css";

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
    <Flex
      component="nav"
      className={S.root}
      data-element-id="navbar-root"
      data-testid="admin-navbar"
      aria-label={t`Navigation bar`}
      px="md"
      py="sm"
      h={ADMIN_NAVBAR_HEIGHT}
      align="center"
      justify="space-between"
      flex="0 0 auto"
    >
      <Link to="/admin" className={S.logoLink}>
        <Flex
          className={S.logoContainer}
          miw={32}
          maw="20rem"
          h={32}
          align="center"
          justify="center"
        >
          <LogoIcon dark />
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
          <div className={S.logoText}>{t`Metabase Admin`}</div>
        </Flex>
      </Link>

      <Flex
        className={S.mobileHide}
        align="center"
        miw={0}
        flex="1 1 0"
        pl="xl"
      >
        <Flex
          component="ul"
          gap="xs"
          flex="0 1 auto"
          miw={0}
          data-testid="admin-navbar-items"
        >
          {adminPaths.map(({ name, key, path }) => (
            <AdminNavItem
              name={name}
              path={path}
              key={key}
              currentPath={currentPath}
            />
          ))}
        </Flex>

        {!isPaidPlan && isAdmin && <StoreLink />}
      </Flex>
      <Flex ml="auto" gap="sm">
        <MobileNavbar adminPaths={adminPaths} currentPath={currentPath} />
        <AppSwitcher />
      </Flex>
    </Flex>
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
    <div className={S.mobileNavbar} ref={ref}>
      <Button
        onClick={() => setMobileNavOpen((prev) => !prev)}
        variant="subtle"
        p="0.25rem"
        leftSection={
          <Icon name="burger" size={32} className={S.mobileHamburgerIcon} />
        }
      />

      {mobileNavOpen && (
        <Stack
          component="ul"
          className={S.mobileNavBarItems}
          ta="right"
          p="md"
          gap="xl"
        >
          {adminPaths.map(({ name, key, path }) => (
            <Link
              to={path}
              key={key}
              className={cx(AdminNavItemS.navLink, {
                [AdminNavItemS.selected]: currentPath.startsWith(path),
              })}
            >
              {name}
            </Link>
          ))}
        </Stack>
      )}
    </div>
  );
};
