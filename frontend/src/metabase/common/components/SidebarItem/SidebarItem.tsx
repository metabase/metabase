import { memo } from "react";
import { Link } from "react-router";

import type { IconName } from "metabase/ui";

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
      className={S.item}
      activeClassName={S.selected}
      onClick={onClick}
    >
      <LabelIcon className={S.icon} icon={icon} />
      <span className={S.name}>{sidebar || name}</span>
    </Link>
  </li>
);

export const SidebarItem = memo(SidebarItemInner);
