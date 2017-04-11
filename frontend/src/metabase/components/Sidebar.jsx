/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import S from "./Sidebar.css";

import Breadcrumbs from "./Breadcrumbs.jsx";

import LabelIcon from "./LabelIcon.jsx";

import cx from 'classnames';
import pure from "recompose/pure";

const Sidebar = ({
    sections,
    labels,
    breadcrumbs,
    labelsLoading,
    labelsError,
    style,
    className
}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            <div className={S.breadcrumbs}>
                <Breadcrumbs
                    className="py4"
                    crumbs={breadcrumbs}
                    inSidebar={true}
                    placeholder="Data Reference"
                />
            </div>
            {Object.values(sections)
                .filter(section => !section.hidden)
                .map(section =>
                    <SidebarItem key={section.id} href={section.id} {...section} />
                )
            }
        </ul>
    </div>

Sidebar.propTypes = {
    className:      PropTypes.string,
    style:          PropTypes.object,
    breadcrumbs:    PropTypes.array,
    sections:       PropTypes.object.isRequired,
    labels:         PropTypes.array,
    labelsLoading:  PropTypes.bool,
    labelsError:    PropTypes.any,
};

const SidebarSectionTitle = ({ name, href }) =>
    <li>
        <Link to={href} className={S.sectionTitle} activeClassName={S.selected}>{name}</Link>
    </li>

SidebarSectionTitle.propTypes = {
    name:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

const SidebarItem = ({ name, sidebar, icon, href }) =>
    <li>
        <Link to={href} className={S.item} activeClassName={S.selected}>
            <LabelIcon className={S.icon} icon={icon}/>
            <span className={S.name}>{sidebar || name}</span>
        </Link>
    </li>

SidebarItem.propTypes = {
    name:  PropTypes.string.isRequired,
    sidebar:  PropTypes.string,
    icon:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

export default pure(Sidebar);
