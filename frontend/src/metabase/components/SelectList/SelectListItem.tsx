import cx from "classnames";
import type * as React from "react";
import _ from "underscore";

import type { IconProps } from "metabase/ui";

import type { BaseSelectListItemProps } from "./BaseSelectListItem";
import { BaseSelectListItem } from "./BaseSelectListItem";
import { ItemIcon, ItemRoot, ItemTitle } from "./SelectListItem.styled";

export interface SelectListItemProps
  extends Omit<BaseSelectListItemProps, "children"> {
  name: string;
  icon?: string | IconProps;
  rightIcon?: string | IconProps;
  children?: React.ReactNode;
  classNames?: {
    root?: string;
    icon?: string;
  };
}

const getIconProps = (icon?: string | IconProps): IconProps =>
  _.isObject(icon) ? icon : ({ name: icon } as IconProps);

export function SelectListItem({
  name,
  icon,
  rightIcon,
  className,
  classNames = {},
  ...otherProps
}: SelectListItemProps) {
  const iconProps = getIconProps(icon);
  const rightIconProps = getIconProps(rightIcon);

  return (
    <BaseSelectListItem
      as={ItemRoot}
      className={cx(classNames.root, className)}
      {...otherProps}
      name={name}
      aria-label={name}
      hasLeftIcon={!!icon}
      hasRightIcon={!!rightIcon}
    >
      {icon && (
        <ItemIcon className={classNames.icon} color="brand" {...iconProps} />
      )}
      <ItemTitle fw="bold" lh="normal" data-testid="option-text">
        {name}
      </ItemTitle>
      {rightIconProps.name && (
        <ItemIcon className={classNames.icon} {...rightIconProps} />
      )}
    </BaseSelectListItem>
  );
}
