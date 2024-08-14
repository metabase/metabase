import type {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  SyntheticEvent,
} from "react";

import { useScrollOnMount } from "metabase/hooks/use-scroll-on-mount";

import { BaseItemRoot } from "./SelectListItem.styled";

export interface BaseSelectListItemProps {
  id: string | number;
  name: string;
  onSelect: (id: string | number, event: SyntheticEvent) => void;
  children: ReactNode;
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
      onClick={(event: MouseEvent) => onSelect(id, event)}
      onKeyDown={(event: KeyboardEvent) =>
        event.key === "Enter" && onSelect(id, event)
      }
      className={className}
      {...rest}
    >
      {children}
    </Root>
  );
}

BaseSelectListItem.Root = BaseItemRoot;
