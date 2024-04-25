import type { MouseEvent, ReactNode } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";

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
  disabled?: boolean;
  onClose?: () => void;
}

const EntityMenuItem = ({
  title,
  icon,
  action,
  link,
  externalLink,
  tooltip,
  disabled,
  onClose,
}: EntityMenuItemProps): JSX.Element | null => {
  if (link && action) {
    // You cannot specify both action and link props!
    return null;
  }

  const content = (
    <MenuItemContent disabled={disabled}>
      {icon && <MenuItemIcon name={icon} size={16} />}
      <MenuItemTitle>{title}</MenuItemTitle>
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
  <Tooltip tooltip={tooltip} placement="right">
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
  <Tooltip tooltip={tooltip} placement="right">
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityMenuItem;
