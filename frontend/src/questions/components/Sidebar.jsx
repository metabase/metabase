/* eslint "react/prop-types": "warn" */
import React, { PropTypes } from "react";
import { Link } from "react-router";
import S from "./Sidebar.css";
import cx from 'classnames';

import LabelIcon from "./LabelIcon.jsx";

import { pure } from "recompose";

const Sidebar = ({ sections, labels, style, className }) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            {sections.map(section =>
                <QuestionSidebarItem key={section.id} href={"/questions/" + section.id} {...section} />
            )}
            <QuestionSidebarSectionTitle name="Labels" href="/questions/edit/labels" />
            {labels.map(label =>
                <QuestionSidebarItem key={label.id} href={"/questions/label/"+label.slug} {...label} />
            )}
            <li className={S.divider} />
            <QuestionSidebarItem name="Archive" href="/questions/archived" icon="archive" />
        </ul>
    </div>

Sidebar.propTypes = {
    className:  PropTypes.string,
    style:      PropTypes.object,
    sections:   PropTypes.array.isRequired,
    labels:     PropTypes.array.isRequired,
};

const QuestionSidebarSectionTitle = ({ name, href }) =>
    <li>
        <Link to={href} className={S.sectionTitle} activeClassName={S.selected}>{name}</Link>
    </li>

QuestionSidebarSectionTitle.propTypes = {
    name:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

const QuestionSidebarItem = ({ name, icon, href }) =>
    <li>
        <Link to={href} className={S.item} activeClassName={S.selected}>
            <LabelIcon className={S.icon} icon={icon}/>
            <span className={S.name}>{name}</span>
        </Link>
    </li>

QuestionSidebarItem.propTypes = {
    name:  PropTypes.string.isRequired,
    icon:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

export default pure(Sidebar);
