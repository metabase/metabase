import cx from "classnames";
import type {
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  SyntheticEvent,
} from "react";
import { forwardRef } from "react";

import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import S from "./SelectListItem.module.css";

export interface BaseSelectListItemProps {
  id: string | number;
  name: string;
  onSelect: (id: string | number, event: SyntheticEvent) => void;
  children: ReactNode;
  isSelected?: boolean;
  size?: "small" | "medium";
  className?: string;
  as?: any;
}

type BaseItemRootProps = HTMLAttributes<HTMLLIElement> & {
  size: "small" | "medium";
  isSelected: boolean;
};

const BaseItemRoot = forwardRef<HTMLLIElement, BaseItemRootProps>(
  function BaseItemRoot({ size, isSelected, className, ...props }, ref) {
    return (
      <Box
        component="li"
        ref={ref}
        display="grid"
        bdrs="xs"
        className={cx(
          CS.cursorPointer,
          CS.alignCenter,
          size === "small" ? S.small : S.medium,
          S.itemSpacing,
          S.highlight,
          { [S.selected]: isSelected },
          className,
        )}
        {...props}
      />
    );
  },
);

export function BaseSelectListItem({
  id,
  onSelect,
  isSelected = false,
  size = "medium",
  className,
  as = BaseItemRoot,
  children,
  ...rest
}: BaseSelectListItemProps) {
  const ref = useScrollOnMount<HTMLLIElement>();
  const Root = as;
  return (
    <Root
      ref={isSelected ? ref : undefined}
      isSelected={isSelected}
      aria-selected={isSelected}
      role="menuitem"
      tabIndex={0}
      size={size}
      onClick={(event: MouseEvent) => onSelect(id, event)}
      onKeyDown={(event: KeyboardEvent) =>
        event.key === "Enter" &&
        !event.nativeEvent.isComposing &&
        onSelect(id, event)
      }
      className={className}
      {...rest}
    >
      {children}
    </Root>
  );
}

BaseSelectListItem.Root = BaseItemRoot;
