import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./QueryButton.css";

import Icon from "metabase/components/Icon";

const QueryButton = ({ className, text, icon, iconClass, onClick, link }) => (
  <div className={className}>
    <Link
      className={cx(S.queryButton, "bg-light-hover px1 rounded")}
      onClick={onClick}
      to={link}
    >
      <Icon name={icon} />
      <span className={S.queryButtonText}>{text}</span>
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
