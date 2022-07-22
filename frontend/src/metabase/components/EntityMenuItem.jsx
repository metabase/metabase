/* eslint-disable react/prop-types */
import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import { Item, StyledExternalLink } from "./EntityMenuItem.styled";

const LinkMenuItem = ({
  children,
  link,
  onClose,
  event,
  externalLink,
  disabled,
}) =>
  externalLink ? (
    <StyledExternalLink
      href={link}
      target="_blank"
      disabled={disabled}
      onClick={onClose}
      data-metabase-event={event}
    >
      {children}
    </StyledExternalLink>
  ) : (
    <Link
      to={link}
      disabled={disabled}
      onClick={onClose}
      data-metabase-event={event}
      className="block"
    >
      {children}
    </Link>
  );

const ActionMenuItem = ({ children, action, event, disabled }) => (
  <div onClick={!disabled ? action : undefined} data-metabase-event={event}>
    {children}
  </div>
);

const EntityMenuItem = ({
  action,
  title,
  icon,
  link,
  onClose,
  event,
  externalLink,
  disabled,
}) => {
  if (link && action) {
    console.warn(
      "EntityMenuItem Error: You cannot specify both action and link props",
    );
    return <div />;
  }

  const content = (
    <Item disabled={disabled}>
      {icon && <Icon name={icon} mr={1} />}
      <span className="text-bold">{title}</span>
    </Item>
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

export default EntityMenuItem;
