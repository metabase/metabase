import { MouseEvent, ReactNode } from "react";
import * as React from "react";
import Tooltip from "metabase/core/components/Tooltip";
import {
  MenuExternalLink,
  MenuItemContent,
  MenuItemIcon,
  MenuItemTitle,
  MenuLink,
} from "./EntityMenuItem.styled";

export interface EntityMenuItemProps {
  title?: string;
  icon?: string;
  action?: (event: MouseEvent<HTMLDivElement>) => void;
  link?: string;
  externalLink?: boolean;
  tooltip?: React.ReactNode;
  disabled?: boolean;
  event?: string;
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
  event,
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
        event={event}
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
      <ActionMenuItem
        action={action}
        tooltip={tooltip}
        disabled={disabled}
        event={event}
      >
        {content}
      </ActionMenuItem>
    );
  }

  return null;
};

interface ActionMenuItemProps {
  action?: (event: MouseEvent<HTMLDivElement>) => void;
  tooltip?: React.ReactNode;
  disabled?: boolean;
  event?: string;
  children?: ReactNode;
}

const ActionMenuItem = ({
  action,
  tooltip,
  disabled,
  event,
  children,
}: ActionMenuItemProps) => (
  <Tooltip tooltip={tooltip} placement="right">
    <div onClick={disabled ? undefined : action} data-metabase-event={event}>
      {children}
    </div>
  </Tooltip>
);

interface LinkMenuItemProps {
  link: string;
  externalLink?: boolean;
  tooltip?: ReactNode;
  disabled?: boolean;
  event?: string;
  children?: ReactNode;
  onClose?: () => void;
}

const LinkMenuItem = ({
  link,
  externalLink,
  tooltip,
  disabled,
  event,
  children,
  onClose,
}: LinkMenuItemProps): JSX.Element => (
  <Tooltip tooltip={tooltip} placement="right">
    {externalLink ? (
      <MenuExternalLink
        href={link}
        target="_blank"
        data-metabase-event={event}
        onClick={onClose}
        data-testid="entity-menu-link"
      >
        {children}
      </MenuExternalLink>
    ) : (
      <MenuLink
        to={link}
        disabled={disabled}
        data-metabase-event={event}
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
