import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { ItemRoot, ItemIcon, ItemTitle } from "./SelectListItem.styled";
import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

const propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  isSelected: PropTypes.bool,
  rightIcon: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      name: PropTypes.name,
    }),
  ]),
  size: PropTypes.oneOf(["small", "medium"]),
  className: PropTypes.string,
};

export function SelectListItem({
  id,
  name,
  icon,
  iconColor = "brand",
  onSelect,
  isSelected = false,
  rightIcon,
  size = "medium",
  className,
}) {
  const ref = useScrollOnMount();

  const rightIconProps = _.isObject(rightIcon)
    ? rightIcon
    : { name: rightIcon };

  return (
    <ItemRoot
      innerRef={isSelected ? ref : null}
      isSelected={isSelected}
      role="menuitem"
      tabIndex={0}
      size={size}
      onClick={() => onSelect(id)}
      onKeyDown={e => e.key === "Enter" && onSelect(id)}
      className={className}
    >
      <ItemIcon name={icon} color={iconColor} />
      <ItemTitle>{name}</ItemTitle>
      {rightIconProps.name && <ItemIcon {...rightIconProps} />}
    </ItemRoot>
  );
}

SelectListItem.propTypes = propTypes;
