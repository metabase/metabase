import { memo } from "react";
import { Link } from "react-router";

import type { IconName } from "metabase/ui";

import LabelIcon from "../LabelIcon";
import S from "../Sidebar.module.css";

interface SidebarItemProps {
  name?: string;
  sidebar: string;
  icon: IconName;
  href: string;
}
const SidebarItem = ({ name, sidebar, icon, href }: SidebarItemProps) => (
  <li>
    <Link to={href} className={S.item} activeClassName={S.selected}>
      <LabelIcon className={S.icon} icon={icon} />
      <span className={S.name}>{sidebar || name}</span>
    </Link>
  </li>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(SidebarItem);
