/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import S from "./Sidebar.css";

import LabelIcon from "./LabelIcon";

import pure from "recompose/pure";

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

export default pure(SidebarItem);
