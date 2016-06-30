/* eslint "react/prop-types": "warn" */
//TODO: refactor this and Sidebar from /questions into shared component
import React, { PropTypes } from 'react';
import { Link } from 'react-router';
import S from './Sidebar.css';

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper.jsx';

import LabelIcon from './LabelIcon.jsx';

import cx from 'classnames';
import { pure } from 'recompose';

const Sidebar = ({sections, className, style}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            {
                sections.map(section =>
                    //TODO: refactor base href into prop
                    <SidebarItem key={section.id}
                        href={"/reference/" + section.id}
                        {...section} />
            )}
        </ul>
    </div>

Sidebar.propTypes = {
    className:      PropTypes.string,
    style:          PropTypes.object,
    sections:       PropTypes.array.isRequired
};


const SidebarItem = pure(({ name, icon, href }) =>
    <li>
        <Link to={href} className={S.item} activeClassName={S.selected}>
            <LabelIcon className={S.icon} icon={icon}/>
            <span className={S.name}>{name}</span>
        </Link>
    </li>
)

SidebarItem.propTypes = {
    name:  PropTypes.string.isRequired,
    icon:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

export default pure(Sidebar);
