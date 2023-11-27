import type * as React from "react";

import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

import { BaseItemRoot } from "./SelectListItem.styled";

type BaseProps = Omit<React.HTMLAttributes<HTMLLIElement>, "id" | "onSelect">;

export interface BaseSelectListItemProps extends BaseProps {
  id: string | number;
  name: string;
  onSelect: (id: string | number) => void;
  children: React.ReactNode;
  isSelected?: boolean;
  size?: "small" | "medium";
  className?: string;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  as?: any;
}

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
  const ref = useScrollOnMount();
  const Root = as;
  return (
    <Root
      ref={isSelected ? ref : undefined}
      isSelected={isSelected}
      aria-selected={isSelected}
      role="menuitem"
      tabIndex={0}
      size={size}
      onClick={() => onSelect(id)}
      onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && onSelect(id)}
      className={className}
      {...rest}
    >
      {children}
    </Root>
  );
}

BaseSelectListItem.Root = BaseItemRoot;
