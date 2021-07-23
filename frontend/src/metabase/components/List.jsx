/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

import S from "./List.css";

const List = ({ children }) => <ul className={S.list}>{children}</ul>;

List.propTypes = {
  children: PropTypes.any.isRequired,
};

export default React.memo(List);
