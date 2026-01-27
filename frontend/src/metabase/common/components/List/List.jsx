/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { memo } from "react";

import S from "./List.module.css";

const ListInner = ({ children }) => <ul className={S.list}>{children}</ul>;

ListInner.propTypes = {
  children: PropTypes.any.isRequired,
};

export const List = memo(ListInner);
