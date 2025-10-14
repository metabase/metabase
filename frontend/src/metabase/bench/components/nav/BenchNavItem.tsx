import cx from "classnames";
import { Link } from "react-router";

import { usePath } from "metabase/common/hooks";
import type { IconName, NavLinkProps } from "metabase/ui";
import { Icon, NavLink } from "metabase/ui";

import S from "./BenchNavItem.module.css";

export const BenchNavItem = ({
  url,
  icon,
  label,
  className,
  ...rest
}: { url: string; icon: IconName } & NavLinkProps) => {
  const pathname = usePath();
  const isActive = pathname?.includes(url);

  return (
    <NavLink
      component={Link}
      className={cx(className, S.menuItem)}
      to={url}
      active={isActive}
      leftSection={<Icon className={S.menuItemIcon} name={icon} size={16} />}
      label={label}
      p="md"
      {...rest}
    />
  );
};
