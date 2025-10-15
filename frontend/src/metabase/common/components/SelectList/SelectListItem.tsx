import cx from "classnames";
import type * as React from "react";
import _ from "underscore";

import { Ellipsified } from "metabase/common/components/Ellipsified";
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
    label?: string;
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
        <ItemIcon className={classNames.icon} c="brand" {...iconProps} />
      )}
      <ItemTitle
        className={classNames.label}
        fw="bold"
        lh="normal"
        data-testid="option-text"
      >
        <Ellipsified>{name}</Ellipsified>
      </ItemTitle>
      {rightIconProps.name && (
        <ItemIcon className={classNames.icon} {...rightIconProps} />
      )}
    </BaseSelectListItem>
  );
}
