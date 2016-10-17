/* eslint "react/prop-types": "warn" */
import React, { PropTypes } from "react";
import { Link } from "react-router";
import S from "./Sidebar.css";

import Icon from "metabase/components/Icon.jsx";
import LabelIcon from "metabase/components/LabelIcon.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import cx from 'classnames';
import pure from "recompose/pure";

const LABEL_LINK = "/questions/edit/labels";

const Sidebar = ({ sections, labels, labelsLoading, labelsError, style, className }) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            {sections.map(section =>
                <QuestionSidebarItem key={section.id} href={"/questions/" + section.id} {...section} />
            )}
            <QuestionSidebarSectionTitle name="Labels" href={LABEL_LINK} />
        </ul>
        <LoadingAndErrorWrapper loading={labelsLoading} error={labelsError} noBackground noWrapper>
        { () => labels.length > 0 ? // eslint-disable-line
            <ul>
            { labels.map(label =>
                <QuestionSidebarItem key={label.id} href={"/questions/label/"+label.slug} {...label} />
            )}
            </ul>
        :
            <div className={S.noLabelsMessage}>
                <b>Create labels to group and manage questions.</b>
                <Link to={LABEL_LINK} className="link block mt2">
                    Create a label
                </Link>
            </div>
        }
        </LoadingAndErrorWrapper>
        <ul>
            <li className={S.divider} />
            <QuestionSidebarItem name="Archive" href="/questions/archived" icon="archive" />
        </ul>
    </div>

Sidebar.propTypes = {
    className:      PropTypes.string,
    style:          PropTypes.object,
    sections:       PropTypes.array.isRequired,
    labels:         PropTypes.array.isRequired,
    labelsLoading:  PropTypes.bool.isRequired,
    labelsError:    PropTypes.any,
};

const QuestionSidebarSectionTitle = ({ name, href }) =>
    <li className="flex align-center">
        <span className={S.sectionTitle}>{name}</span>
        <Tooltip tooltip="Manage labels">
            <Link to={href} className="ml1 text-brand-hover">
                <Icon name="gear" style={{ marginTop: 4 }} />
           </Link>
        </Tooltip>
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
