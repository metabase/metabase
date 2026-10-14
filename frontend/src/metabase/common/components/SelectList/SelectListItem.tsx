import cx from "classnames";
import _ from "underscore";

import {
  EntityIcon,
  type EntityIconProps,
} from "metabase/common/components/EntityIcon";
import type { IconProps } from "metabase/ui";
import { Ellipsified, Text } from "metabase/ui";
import { maybeColor } from "metabase/ui/utils/colors";

import type { BaseSelectListItemProps } from "./BaseSelectListItem";
import { BaseSelectListItem } from "./BaseSelectListItem";
import S from "./SelectListItem.module.css";

export interface SelectListItemProps extends Omit<
  BaseSelectListItemProps,
  "children"
> {
  name: string;
  icon?: string | IconProps | (IconProps & { iconUrl?: string });
  rightIcon?: string | IconProps;
  children?: React.ReactNode;
  classNames?: {
    root?: string;
    icon?: string;
    label?: string;
  };
}

const getIconProps = (icon?: string | IconProps): IconProps =>
  // Unjustified type cast. FIXME
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
  const iconUrl =
    _.isObject(icon) && "iconUrl" in icon ? icon.iconUrl : undefined;

  return (
    <BaseSelectListItem
      className={cx(
        S.grid,
        { [S.hasLeftIcon]: !!icon, [S.hasRightIcon]: !!rightIcon },
        classNames.root,
        className,
      )}
      {...otherProps}
      name={name}
      aria-label={name}
    >
      {icon && (
        <ItemIcon
          iconUrl={iconUrl}
          {...iconProps}
          className={iconProps.className ?? classNames.icon}
        />
      )}
      <Text
        className={cx(S.title, classNames.label)}
        fw="bold"
        lh="normal"
        data-testid="option-text"
      >
        <Ellipsified>{name}</Ellipsified>
      </Text>
      {rightIconProps.name && (
        <ItemIcon
          {...rightIconProps}
          className={rightIconProps.className ?? classNames.icon}
        />
      )}
    </BaseSelectListItem>
  );
}

function ItemIcon({
  color = "core-brand",
  className,
  style,
  ...props
}: EntityIconProps) {
  return (
    <EntityIcon
      {...props}
      className={cx(S.icon, className)}
      style={{
        "--select-list-item-icon-color": maybeColor(color),
        ...style,
      }}
    />
  );
}
