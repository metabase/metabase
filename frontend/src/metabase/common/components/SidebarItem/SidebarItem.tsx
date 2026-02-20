import { memo } from "react";
import { NavLink } from "react-router-dom";

import { LabelIcon } from "../LabelIcon";
import S from "../Sidebar.module.css";

type SidebarItemProps = {
  name: string;
  sidebar?: string;
  icon: string;
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
    <NavLink
      to={href}
      className={({ isActive }) =>
        isActive ? `${S.item} ${S.selected}` : S.item
      }
      onClick={onClick}
    >
      <LabelIcon className={S.icon} icon={icon} />
      <span className={S.name}>{sidebar || name}</span>
    </NavLink>
  </li>
);

export const SidebarItem = memo(SidebarItemInner);
