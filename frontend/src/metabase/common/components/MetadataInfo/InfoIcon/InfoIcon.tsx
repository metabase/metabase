import cx from "classnames";
import type { ComponentPropsWithoutRef, ElementType } from "react";

import { Icon, type IconProps } from "metabase/ui";

import S from "./InfoIcon.module.css";

type HoverParentProps<C extends ElementType> = {
  as?: C;
  className?: string;
} & Omit<ComponentPropsWithoutRef<C>, "as" | "className">;

export function HoverParent<C extends ElementType = "div">({
  as,
  className,
  ...props
}: HoverParentProps<C>) {
  const Component: ElementType = as ?? "div";
  return <Component {...props} className={cx(S.hoverParent, className)} />;
}

export const PopoverHoverTarget = ({ className, ...props }: IconProps) => {
  return <Icon className={cx(S.hoverTarget, className)} {...props} />;
};

export const PopoverDefaultIcon = ({ className, ...props }: IconProps) => {
  return <Icon className={cx(S.defaultIcon, className)} {...props} />;
};
