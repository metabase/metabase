import cx from "classnames";
import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  forwardRef,
} from "react";

import { Box } from "metabase/ui";

import S from "./NavLinkButton.module.css";

export type NavLinkButtonProps = ComponentPropsWithoutRef<"div"> & {
  disabled?: boolean;
};

/**
 * A compact action button sized to sit in a `NavLink`'s right section.
 *
 * A `NavLink` renders as an `<a>`, and a nested `<button>` would be invalid
 * HTML, so this is a `<div role="button">` (with keyboard activation) instead.
 */
export const NavLinkButton = forwardRef<HTMLDivElement, NavLinkButtonProps>(
  function NavLinkButton(
    { onClick, disabled, className, children, ...props },
    ref,
  ) {
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      // The button is an independent target inside a clickable NavLink; keep its
      // click from bubbling up and triggering the row.
      event.stopPropagation();
      onClick?.(event);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      // A `<div role="button">` doesn't activate on keyboard like a native
      // button, so wire up Enter/Space ourselves.
      if (!disabled && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.currentTarget.click();
      }
    };

    return (
      <Box
        {...props}
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        data-navlink-button
        className={cx(S.root, className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </Box>
    );
  },
);
