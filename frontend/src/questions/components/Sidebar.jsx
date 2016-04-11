import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./Sidebar.css";

import Icon from "metabase/components/Icon.jsx";

import { pure } from "recompose";
import cx from "classnames";

const Sidebar = ({ sections, topics, labels }) =>
    <div className={S.sidebar}>
        <ul>
            {sections.map(section =>
                <QuestionSidebarItem key={section.id} href={"/questions/" + section.id} {...section} />
            )}
            <QuestionSidebarSectionTitle name="Topics" href="/questions/edit/topics" />
            {topics.map(topic =>
                <QuestionSidebarItem key={topic.id} href={"/questions/topics/"+topic.slug} {...topic} />
            )}
            <QuestionSidebarSectionTitle name="Labels" href="/questions/edit/labels" />
            {labels.map(label =>
                <QuestionSidebarItem key={label.id} href={"/questions/labels/"+label.slug} {...label} />
            )}
            <li className={S.divider} />
            <QuestionSidebarItem name="Archive" href="/questions/archive" icon="star" />
        </ul>
    </div>

const QuestionSidebarSectionTitle = ({ name, href }) =>
    <li>
        <Link to={href} className={S.sectionTitle} activeClassName={S.selected}>{name}</Link>
    </li>

const QuestionSidebarItem = ({ name, icon, href }) =>
    <li>
        <Link to={href} className={S.item} activeClassName={S.selected}>
            <QuestionSidebarIcon icon={icon} width={32} height={32} />
            <span>{name}</span>
        </Link>
    </li>

const QuestionSidebarIcon = ({ icon }) =>
    icon.charAt(0) === ":" ?
        <span className={S.icon} style={{ width: 18, height: 18 }}>🐱</span>
    : icon.charAt(0) === "#" ?
        <span className={cx(S.icon, S.colorIcon)} style={{ backgroundColor: icon }}></span>
    :
        <Icon className={S.icon} name={icon} />

export default pure(Sidebar);
