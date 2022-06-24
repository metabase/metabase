import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { iconPropTypes } from "metabase/components/Icon";

import { BaseSelectListItem } from "./BaseSelectListItem";
import { ItemRoot, ItemIcon, ItemTitle } from "./SelectListItem.styled";

const iconPropType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.shape(iconPropTypes),
]);

const propTypes = {
  ...BaseSelectListItem.propTypes,
  icon: iconPropType,
  rightIcon: iconPropType,
};

export function SelectListItem(props) {
  const { name, icon, rightIcon } = props;

  const iconProps = _.isObject(icon) ? icon : { name: icon };
  const rightIconProps = _.isObject(rightIcon)
    ? rightIcon
    : { name: rightIcon };

  return (
    <BaseSelectListItem
      as={ItemRoot}
      {...props}
      hasLeftIcon={!!icon}
      hasRightIcon={!!rightIcon}
    >
      {icon && <ItemIcon color="brand" {...iconProps} />}
      <ItemTitle data-testid="option-text">{name}</ItemTitle>
      {rightIconProps.name && <ItemIcon {...rightIconProps} />}
    </BaseSelectListItem>
  );
}

SelectListItem.propTypes = propTypes;
