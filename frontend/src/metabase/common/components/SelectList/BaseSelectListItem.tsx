import { useMergedRef } from "@mantine/hooks";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
  forwardRef,
} from "react";

import { useScrollOnMount } from "metabase/common/hooks/use-scroll-on-mount";

import { BaseItemRoot } from "./SelectListItem.styled";

export interface BaseSelectListItemProps {
  id: string | number;
  name: string;
  onSelect: (id: string | number, event: SyntheticEvent) => void;
  children: ReactNode;
  isSelected?: boolean;
  isDisabled?: boolean;
  size?: "small" | "medium";
  className?: string;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  as?: any;
}

const BaseSelectListItemInner = forwardRef<
  HTMLLIElement,
  BaseSelectListItemProps
>(function BaseSelectListItem(
  {
    id,
    onSelect,
    isSelected = false,
    isDisabled = false,
    size = "medium",
    className,
    as = BaseItemRoot,
    children,
    ...rest
  },
  forwardedRef,
) {
  // Merged so a consumer (e.g. Tooltip, which needs the DOM node to
  // position the floating element) can still attach its own ref.
  const scrollRef = useScrollOnMount<HTMLLIElement>();
  const mergedRef = useMergedRef(isSelected ? scrollRef : null, forwardedRef);
  const Root = as;
  return (
    <Root
      ref={mergedRef}
      isSelected={isSelected}
      aria-selected={isSelected}
      aria-disabled={isDisabled || undefined}
      data-disabled={isDisabled || undefined}
      role="menuitem"
      tabIndex={0}
      size={size}
      style={isDisabled ? { opacity: 0.4 } : undefined}
      onClick={(event: MouseEvent) => !isDisabled && onSelect(id, event)}
      onKeyDown={(event: KeyboardEvent) =>
        event.key === "Enter" &&
        !event.nativeEvent.isComposing &&
        !isDisabled &&
        onSelect(id, event)
      }
      className={className}
      {...rest}
    >
      {children}
    </Root>
  );
});

export const BaseSelectListItem = Object.assign(BaseSelectListItemInner, {
  Root: BaseItemRoot,
});
