import React from "react";
import PropTypes from "prop-types";

import { ItemRoot, ItemIcon, ItemTitle } from "./QuestionPickerItem.styled";

QuestionPickerItem.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  isCollection: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

export function QuestionPickerItem({ id, name, icon, isCollection, onSelect }) {
  return (
    <ItemRoot
      role="menuitem"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={e => e.key === "Enter" && onSelect(id)}
    >
      <ItemIcon name={icon} isHighlighted={!isCollection} />
      <ItemTitle>{name}</ItemTitle>
      {isCollection && <ItemIcon name="chevronright" />}
    </ItemRoot>
  );
}
