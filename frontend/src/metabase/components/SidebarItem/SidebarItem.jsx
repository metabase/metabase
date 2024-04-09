/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";

import LabelIcon from "../LabelIcon";
import S from "../Sidebar.module.css";

const SidebarItem = ({ name, sidebar, icon, href }) => (
  <li>
    <Link to={href} className={S.item} activeClassName={S.selected}>
      <LabelIcon className={S.icon} icon={icon} />
      <span className={S.name}>{sidebar || name}</span>
    </Link>
  </li>
);

SidebarItem.propTypes = {
  name: PropTypes.string.isRequired,
  sidebar: PropTypes.string,
  icon: PropTypes.string.isRequired,
  href: PropTypes.string.isRequired,
};

export default memo(SidebarItem);
