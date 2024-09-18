import { memo } from "react";
import { Link } from "react-router";

import LabelIcon from "../LabelIcon";
import S from "../Sidebar.module.css";
import { IconName } from "metabase/ui";

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

export default memo(SidebarItem);
