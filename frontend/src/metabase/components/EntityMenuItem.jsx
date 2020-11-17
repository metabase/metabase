import React from "react";
import styled from "styled-components";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

const Item = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("text-medium")};
  padding: 0.85em 1.45em;
  text-decoration: none;
  transition: all 300ms linear;
  :hover {
    color: ${color("brand")};
  }
  > .Icon {
    color: ${color("text-light")};
    margin-right: 0.65em;
  }
  :hover > .Icon {
    color: ${color("brand")};
    transition: all 300ms linear;
  },
  /* icon specific tweaks
     the alert icon should be optically aligned  with the x-height of the text */
  > .Icon.Icon-alert {
    transform: translate-y(1px),
  }
  /* the embed icon should be optically aligned with the x-height of the text */
  > .Icon.Icon-embed {
    transform: translate-y(1px);
  }
  /* the download icon should be optically aligned with the x-height of the text */
  > .Icon.Icon-download: {
    transform: translate-y(1px);
  }
  /* the history icon is wider so it needs adjustment to center it with other
   icons */
  "> .Icon.Icon-history": {
    transform: translate-x(-2px);
  },
`;

const LinkMenuItem = ({ children, link, onClose, event, externalLink }) => (
  <Link
    to={link}
    target={externalLink ? "_blank" : null}
    onClick={onClose}
    data-metabase-event={event}
    style={{ display: "block" }}
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
