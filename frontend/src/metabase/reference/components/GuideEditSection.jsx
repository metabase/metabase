import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideEditSection.css";

import Icon from "metabase/components/Icon.jsx";

const GuideEditSection = ({
    children,
    isCollapsed,
    isDisabled,
    collapsedIcon,
    collapsedTitle,
    linkMessage,
    link,
    action,
    onClick
}) => isCollapsed ?
    <div 
        className={cx(
            S.guideEditSectionCollapsed, 
            isDisabled && S.guideEditSectionDisabled
        )}
        onClick={onClick}
    >
        <Icon className={S.guideEditSectionCollapsedIcon} name={collapsedIcon} size={28} />
        <span className={S.guideEditSectionCollapsedTitle}>{collapsedTitle}</span>
        <span className={S.guideEditSectionCollapsedLink}>
            {isDisabled && link ? (link.startsWith('http') ? 
                    <a href={link} target="_blank">{linkMessage}</a> :
                    <Link to={link}>{linkMessage}</Link>
                ) : 
                action &&
                    <a onClick={action}>{linkMessage}</a>
            }
        </span>
    </div> :
    <div className={S.guideEditSection}>
        {children}
    </div>;
GuideEditSection.propTypes = {
    isCollapsed: PropTypes.bool.isRequired
};

export default pure(GuideEditSection);
