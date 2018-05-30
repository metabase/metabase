import cxs from "cxs";
import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

const itemClasses = cxs({
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  color: "#616D75",
  paddingLeft: "1.45em",
  paddingRight: "1.45em",
  paddingTop: "0.85em",
  paddingBottom: "0.85em",
  textDecoration: "none",
  transition: "all 300ms linear",
  ":hover": {
    color: "#509ee3",
  },
  "> .Icon": {
    color: "#BCC5CA",
    marginRight: "0.65em",
  },
  ":hover > .Icon": {
    color: "#509ee3",
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
  // the history icon is wider so it needs adjustement to center it with other
  // icons
  "> .Icon.Icon-history": {
    transform: `translateX(-2px)`,
  },
});

const LinkMenuItem = ({ children, link }) => (
  <Link className={itemClasses} to={link}>
    {children}
  </Link>
);

const ActionMenuItem = ({ children, action }) => (
  <div className={itemClasses} onClick={action}>
    {children}
  </div>
);

const EntityMenuItem = ({ action, title, icon, link }) => {
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
    return <LinkMenuItem link={link}>{content}</LinkMenuItem>;
  }
  if (action) {
    return <ActionMenuItem action={action}>{content}</ActionMenuItem>;
  }
};

export default EntityMenuItem;
