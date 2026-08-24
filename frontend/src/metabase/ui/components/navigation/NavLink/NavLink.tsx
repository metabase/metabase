import {
  NavLink as MantineNavLink,
  type NavLinkProps as MantineNavLinkProps,
  createPolymorphicComponent,
} from "@mantine/core";
import { forwardRef } from "react";

import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import { Icon } from "../../icons";

export interface NavLinkProps extends MantineNavLinkProps {
  leftIcon?: IconName;
}

const getLeftIconColor = (
  variant: NavLinkProps["variant"],
  active: boolean | undefined,
): ColorName | undefined => {
  if (variant === "primary" && active) {
    return "icon-brand-inverse";
  }
  if (variant === "primary" || variant === "secondary") {
    return "icon-brand";
  }
  return undefined;
};

const NavLinkInner = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink({ leftIcon, leftSection, variant, active, ...props }, ref) {
    return (
      <MantineNavLink
        ref={ref}
        variant={variant}
        active={active}
        leftSection={
          leftIcon != null ? (
            <Icon name={leftIcon} color={getLeftIconColor(variant, active)} />
          ) : (
            leftSection
          )
        }
        {...props}
      />
    );
  },
);

export const NavLink = createPolymorphicComponent<"a", NavLinkProps>(
  NavLinkInner,
);
