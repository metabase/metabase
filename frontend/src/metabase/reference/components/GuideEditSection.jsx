import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideEditSection.css";

import Icon from "metabase/components/Icon.jsx";

const GuideEditSection = ({
  children,
  isCollapsed,
  isDisabled,
  showLink,
  collapsedIcon,
  collapsedTitle,
  linkMessage,
  link,
  action,
  expand,
}) =>
  isCollapsed ? (
    <div
      className={cx("text-measure", S.guideEditSectionCollapsed, {
        "cursor-pointer border-brand-hover": !isDisabled,
        [S.guideEditSectionDisabled]: isDisabled,
      })}
      onClick={!isDisabled && expand}
    >
      <Icon
        className={S.guideEditSectionCollapsedIcon}
        name={collapsedIcon}
        size={24}
      />
      <span className={S.guideEditSectionCollapsedTitle}>{collapsedTitle}</span>
      {(showLink || isDisabled) &&
        (link ? (
          link.startsWith("http") ? (
            <a
              className={S.guideEditSectionCollapsedLink}
              href={link}
              target="_blank"
            >
              {linkMessage}
            </a>
          ) : (
            <Link className={S.guideEditSectionCollapsedLink} to={link}>
              {linkMessage}
            </Link>
          )
        ) : (
          action && (
            <a className={S.guideEditSectionCollapsedLink} onClick={action}>
              {linkMessage}
            </a>
          )
        ))}
    </div>
  ) : (
    <div className={cx("my4", S.guideEditSection)}>{children}</div>
  );
GuideEditSection.propTypes = {
  isCollapsed: PropTypes.bool.isRequired,
};

export default pure(GuideEditSection);
