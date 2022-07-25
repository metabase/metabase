import React, { ReactNode } from "react";
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
  action?: () => void;
  link?: string;
  externalLink?: boolean;
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
  disabled,
  event,
  onClose,
}: EntityMenuItemProps): JSX.Element | null => {
  if (link && action) {
    return <div />;
  }

  const content = (
    <MenuItemContent disabled={disabled}>
      {icon && <MenuItemIcon name={icon} />}
      <MenuItemTitle>{title}</MenuItemTitle>
    </MenuItemContent>
  );

  if (link) {
    return (
      <LinkMenuItem
        link={link}
        externalLink={externalLink}
        disabled={disabled}
        onClose={onClose}
        event={event}
      >
        {content}
      </LinkMenuItem>
    );
  }

  if (action) {
    return (
      <ActionMenuItem action={action} event={event} disabled={disabled}>
        {content}
      </ActionMenuItem>
    );
  }

  return null;
};

interface ActionMenuItemProps {
  action: () => void;
  disabled?: boolean;
  event?: string;
  children?: ReactNode;
}

const ActionMenuItem = ({
  action,
  disabled,
  event,
  children,
}: ActionMenuItemProps) => (
  <div onClick={!disabled ? action : undefined} data-metabase-event={event}>
    {children}
  </div>
);

interface LinkMenuItemProps {
  link: string;
  externalLink?: boolean;
  disabled?: boolean;
  event?: string;
  children?: ReactNode;
  onClose?: () => void;
}

const LinkMenuItem = ({
  link,
  externalLink,
  disabled,
  event,
  children,
  onClose,
}: LinkMenuItemProps): JSX.Element =>
  externalLink ? (
    <MenuExternalLink
      href={link}
      target="_blank"
      onClick={onClose}
      data-metabase-event={event}
    >
      {children}
    </MenuExternalLink>
  ) : (
    <MenuLink
      to={link}
      disabled={disabled}
      onClick={onClose}
      data-metabase-event={event}
    >
      {children}
    </MenuLink>
  );

export default EntityMenuItem;
