import cxs from "cxs";
import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import colors from "metabase/lib/colors";

const itemClasses = cxs({
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  color: colors["text-medium"],
  paddingLeft: "1.45em",
  paddingRight: "1.45em",
  paddingTop: "0.85em",
  paddingBottom: "0.85em",
  textDecoration: "none",
  transition: "all 300ms linear",
  ":hover": {
    color: colors["brand"],
  },
  "> .Icon": {
    color: colors["text-light"],
    marginRight: "0.65em",
  },
  ":hover > .Icon": {
    color: colors["brand"],
    transition: "all 300ms linear",
  },
  // icon specific tweaks
  // the alert icon should be optically aligned  with the x-height of the text
  "> .Icon.Icon-alert": {
    transform: `translateY(1px)`,
  },
  // the embed icon should be optically aligned with the x-height of the text
  "> .Icon.Icon-embed": {
    transform: `translateY(1px)`,
  },
  // the download icon should be optically aligned with the x-height of the text
  "> .Icon.Icon-download": {
    transform: `translateY(1px)`,
  },
  // the history icon is wider so it needs adjustment to center it with other
  // icons
  "> .Icon.Icon-history": {
    transform: `translateX(-2px)`,
  },
});

const LinkMenuItem = ({ children, link, onClose, event, externalLink }) => (
  <Link
    className={itemClasses}
    to={link}
    target={externalLink ? "_blank" : null}
    onClick={onClose}
    data-metabase-event={event}
  >
    {children}
  </Link>
);

const ActionMenuItem = ({ children, action, event }) => (
  <div className={itemClasses} onClick={action} data-metabase-event={event}>
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

  const content = [
    <Icon name={icon} mr={1} />,
    <span className="text-bold">{title}</span>,
  ];

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
};

export default EntityMenuItem;
