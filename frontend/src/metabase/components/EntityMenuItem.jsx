/* eslint-disable react/prop-types */
import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import { Item, StyledExternalLink } from "./EntityMenuItem.styled";

const LinkMenuItem = ({ children, link, onClose, event, externalLink }) =>
  externalLink ? (
    <StyledExternalLink
      href={link}
      target="_blank"
      onClick={onClose}
      data-metabase-event={event}
    >
      {children}
    </StyledExternalLink>
  ) : (
    <Link
      to={link}
      onClick={onClose}
      data-metabase-event={event}
      className="block"
    >
      {children}
    </Link>
  );

const ActionMenuItem = ({ children, action, event }) => (
  <div onClick={action} data-metabase-event={event}>
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
}) => {
  if (link && action) {
    console.warn(
      "EntityMenuItem Error: You cannot specify both action and link props",
    );
    return <div />;
  }

  const content = (
    <Item>
      {icon && <Icon name={icon} mr={1} />}
      <span className="text-bold">{title}</span>
    </Item>
  );

  if (link) {
    return (
      <LinkMenuItem
        link={link}
        externalLink={externalLink}
        onClose={onClose}
        event={event}
      >
        {content}
      </LinkMenuItem>
    );
  }
  if (action) {
    return (
      <ActionMenuItem action={action} event={event}>
        {content}
      </ActionMenuItem>
    );
  }

  return null;
};

export default EntityMenuItem;
