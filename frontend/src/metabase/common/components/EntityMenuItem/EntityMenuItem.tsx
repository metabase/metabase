import type { MouseEvent, ReactNode } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Tooltip } from "metabase/ui";

import {
  MenuExternalLink,
  MenuItemContent,
  MenuItemIcon,
  MenuItemTitle,
  MenuLink,
} from "./EntityMenuItem.styled";

export interface EntityMenuItemProps {
  title?: string;
  icon?: IconName;
  action?: (event: MouseEvent<HTMLDivElement>) => void;
  link?: string;
  externalLink?: boolean;
  tooltip?: ReactNode;
  color?: ColorName;
  hoverColor?: ColorName;
  hoverBgColor?: ColorName;
  disabled?: boolean;
  onClose?: () => void;
  htmlId?: string;
}

export const EntityMenuItem = ({
  title,
  icon,
  action,
  link,
  externalLink,
  tooltip,
  disabled,
  color,
  hoverColor,
  hoverBgColor,
  onClose,
  htmlId,
}: EntityMenuItemProps): JSX.Element | null => {
  if (link && action) {
    // You cannot specify both action and link props!
    return null;
  }

  const content = (
    <MenuItemContent
      disabled={disabled}
      color={color}
      hoverColor={hoverColor}
      hoverBgColor={hoverBgColor}
    >
      {icon && <MenuItemIcon name={icon} size={16} aria-hidden />}
      <MenuItemTitle id={htmlId}>{title}</MenuItemTitle>
    </MenuItemContent>
  );

  if (link) {
    return (
      <LinkMenuItem
        link={link}
        externalLink={externalLink}
        disabled={disabled}
        tooltip={tooltip}
        onClose={onClose}
        data-testid="entity-menu-link"
      >
        {content}
      </LinkMenuItem>
    );
  }

  if (action) {
    return (
      <ActionMenuItem action={action} tooltip={tooltip} disabled={disabled}>
        {content}
      </ActionMenuItem>
    );
  }

  return null;
};

interface ActionMenuItemProps {
  action?: (event: MouseEvent<HTMLDivElement>) => void;
  tooltip?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}

const ActionMenuItem = ({
  action,
  tooltip,
  disabled,
  children,
}: ActionMenuItemProps) => (
  <Tooltip label={tooltip} disabled={tooltip == null} position="right">
    <div onClick={disabled ? undefined : action}>{children}</div>
  </Tooltip>
);

interface LinkMenuItemProps {
  link: string;
  externalLink?: boolean;
  tooltip?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  onClose?: () => void;
}

const LinkMenuItem = ({
  link,
  externalLink,
  tooltip,
  disabled,
  children,
  onClose,
}: LinkMenuItemProps): JSX.Element => (
  <Tooltip label={tooltip} disabled={tooltip == null} position="right">
    {externalLink ? (
      <MenuExternalLink
        href={link}
        target="_blank"
        onClick={onClose}
        data-testid="entity-menu-link"
      >
        {children}
      </MenuExternalLink>
    ) : (
      <MenuLink
        to={link}
        disabled={disabled}
        onClick={onClose}
        data-testid="entity-menu-link"
      >
        {children}
      </MenuLink>
    )}
  </Tooltip>
);
