import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

export type NavLinkButtonProps = ButtonProps;

/**
 * A compact action button sized to sit in a `NavLink`'s right (or left) section.
 */
export const NavLinkButton = forwardRef<HTMLButtonElement, NavLinkButtonProps>(
  function NavLinkButton({ onClick, ...props }, ref) {
    return (
      <Button
        ref={ref}
        data-navlink-button
        variant="subtle"
        h="1rem"
        mih="1rem"
        px="xs"
        py={0}
        radius="xs"
        fz="0.75rem"
        fw={500}
        lh="1rem"
        onClick={(event) => {
          // The button is an independent target inside a clickable NavLink;
          // keep its click from bubbling up and triggering the row.
          event.stopPropagation();
          onClick?.(event);
        }}
        {...props}
      />
    );
  },
);
