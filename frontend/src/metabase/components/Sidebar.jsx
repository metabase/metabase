/* eslint "react/prop-types": "warn" */
import React, { PropTypes } from "react";
import { Link } from "react-router";
import S from "./Sidebar.css";

import Icon from "./Icon.jsx";
import LoadingAndErrorWrapper from "./LoadingAndErrorWrapper.jsx";

import Breadcrumbs from "./Breadcrumbs.jsx";

import LabelIcon from "./LabelIcon.jsx";

import cx from 'classnames';
import { pure } from "recompose";

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
            { breadcrumbs && breadcrumbs.length > 1 ?
                <li>
                    <div className={S.item}>
                        <Breadcrumbs crumbs={breadcrumbs} />
                    </div>
                </li> :
                null
            }
            {Object.values(sections).map(section =>
                <SidebarItem key={section.id} href={section.id} {...section} />
            )}
        </ul>
    </div>

    // { () => labels ?
    //     // TODO: factor this out properly for reuse in questions
    //     <QuestionSidebarSectionTitle name="Labels" href="/questions/edit/labels" />
    //     <LoadingAndErrorWrapper loading={labelsLoading} error={labelsError} noBackground noWrapper>
    //     { () => labels.length > 0 ? // eslint-disable-line
    //         <ul>
    //         { labels.map(label =>
    //             <QuestionSidebarItem key={label.id} href={"/questions/label/"+label.slug} {...label} />
    //         )}
    //         </ul>
    //     :
    //         <div className={S.noLabelsMessage}>
    //             <div>
    //               <Icon name="label" />
    //             </div>
    //             Create labels to group and manage questions.
    //         </div>
    //     }
    //     </LoadingAndErrorWrapper>
    //     <ul>
    //         <li className={S.divider} />
    //         <QuestionSidebarItem name="Archive" href="/questions/archived" icon="archive" />
    //     </ul>
    //     : null
    // }

Sidebar.propTypes = {
    className:      PropTypes.string,
    style:          PropTypes.object,
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

const SidebarItem = ({ name, icon, href }) =>
    <li>
        <Link to={href} className={S.item} activeClassName={S.selected}>
            <LabelIcon className={S.icon} icon={icon}/>
            <span className={S.name}>{name}</span>
        </Link>
    </li>

SidebarItem.propTypes = {
    name:  PropTypes.string.isRequired,
    icon:  PropTypes.string.isRequired,
    href:  PropTypes.string.isRequired,
};

export default pure(Sidebar);
