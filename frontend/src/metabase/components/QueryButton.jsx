import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./QueryButton.css";

import Icon from "metabase/components/Icon.jsx";

const QueryButton = ({ className, text, icon, iconClass, onClick, link }) => (
  <div className={className}>
    <Link className={S.queryButton} onClick={onClick} to={link}>
      <Icon
        className={iconClass}
        size={20}
        {...(typeof icon === "string" ? { name: icon } : icon)}
      />
      <span className={cx(S.queryButtonText, "text-brand-hover")}>{text}</span>
      <span className={S.queryButtonCircle}>
        <Icon size={8} name="chevronright" />
      </span>
    </Link>
  </div>
);
QueryButton.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.any.isRequired,
  text: PropTypes.string.isRequired,
  iconClass: PropTypes.string,
  onClick: PropTypes.func,
  link: PropTypes.string,
};

export default pure(QueryButton);
