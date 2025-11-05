/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { memo } from "react";

import S from "./List.module.css";

const List = ({ children }) => <ul className={S.list}>{children}</ul>;

List.propTypes = {
  children: PropTypes.any.isRequired,
};

export default memo(List);
