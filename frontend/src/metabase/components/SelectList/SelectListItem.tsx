import React from "react";
import _ from "underscore";

import type { IconProps } from "metabase/core/components/Icon";

import {
  BaseSelectListItem,
  BaseSelectListItemProps,
} from "./BaseSelectListItem";
import { ItemRoot, ItemIcon, ItemTitle } from "./SelectListItem.styled";

export interface SelectListItemProps
  extends Omit<BaseSelectListItemProps, "children"> {
  name: string;
  icon?: string | IconProps;
  rightIcon?: string | IconProps;
  children?: React.ReactNode;
}

const getIconProps = (icon?: string | IconProps): IconProps =>
  _.isObject(icon) ? icon : ({ name: icon } as IconProps);

export function SelectListItem({
  name,
  icon,
  rightIcon,
  ...otherProps
}: SelectListItemProps) {
  const iconProps = getIconProps(icon);
  const rightIconProps = getIconProps(rightIcon);

  return (
    <BaseSelectListItem
      as={ItemRoot}
      {...otherProps}
      name={name}
      aria-label={name}
      hasLeftIcon={!!icon}
      hasRightIcon={!!rightIcon}
    >
      {icon && <ItemIcon color="brand" {...iconProps} />}
      <ItemTitle data-testid="option-text">{name}</ItemTitle>
      {rightIconProps.name && <ItemIcon {...rightIconProps} />}
    </BaseSelectListItem>
  );
}
