import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { iconPropTypes } from "metabase/components/Icon";
import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

import { ItemRoot, ItemIcon, ItemTitle } from "./SelectListItem.styled";

const propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  icon: PropTypes.oneOfType([PropTypes.string, PropTypes.shape(iconPropTypes)])
    .isRequired,
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
  onSelect,
  isSelected = false,
  rightIcon,
  size = "medium",
  className,
}) {
  const ref = useScrollOnMount();

  const iconProps = _.isObject(icon) ? icon : { name: icon };
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
      <ItemIcon color="brand" {...iconProps} />
      <ItemTitle>{name}</ItemTitle>
      {rightIconProps.name && <ItemIcon {...rightIconProps} />}
    </ItemRoot>
  );
}

SelectListItem.propTypes = propTypes;
