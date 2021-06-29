import React from "react";
import PropTypes from "prop-types";

import { ItemRoot, ItemIcon, ItemTitle } from "./SelectListItem.styled";

const propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  isHighlighted: PropTypes.bool,
  hasRightArrow: PropTypes.bool,
  size: PropTypes.oneOf(["small", "medium"]),
};

export function SelectListItem({
  id,
  name,
  icon,
  onSelect,
  isHighlighted = false,
  hasRightArrow = false,
  size = "medium",
}) {
  return (
    <ItemRoot
      role="menuitem"
      tabIndex={0}
      size={size}
      onClick={() => onSelect(id)}
      onKeyDown={e => e.key === "Enter" && onSelect(id)}
    >
      <ItemIcon name={icon} isHighlighted={isHighlighted} />
      <ItemTitle>{name}</ItemTitle>
      {hasRightArrow && <ItemIcon name="chevronright" />}
    </ItemRoot>
  );
}

SelectListItem.propTypes = propTypes;
