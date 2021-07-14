import React from "react";
import PropTypes from "prop-types";

import { SelectListItem } from "./SelectListItem";

const propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

export function SelectList({ children, className }) {
  return (
    <ul role="menu" className={className} data-testid="select-list">
      {children}
    </ul>
  );
}

SelectList.propTypes = propTypes;

SelectList.Item = SelectListItem;
