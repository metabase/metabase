import cx from "classnames";
import { memo } from "react";

import { Link } from "metabase/common/components/Link";
import type { IconName } from "metabase-types/api";

import { LabelIcon } from "../LabelIcon";
import S from "../Sidebar.module.css";

type SidebarItemProps = {
  name: string;
  sidebar?: string;
  icon: IconName | `#${string}`;
  href: string;
  onClick?: () => void;
};

const SidebarItemInner = ({
  name,
  sidebar,
  icon,
  href,
  onClick,
}: SidebarItemProps) => (
  <li>
    <Link
      to={href}
      className={({ isActive }) => cx(S.item, { [S.selected]: isActive })}
      onClick={onClick}
    >
      <LabelIcon className={S.icon} icon={icon} />
      <span className={S.name}>{sidebar || name}</span>
    </Link>
  </li>
);

export const SidebarItem = memo(SidebarItemInner);
