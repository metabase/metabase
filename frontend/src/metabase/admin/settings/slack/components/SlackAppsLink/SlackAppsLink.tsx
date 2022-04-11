import React from "react";
import { LinkIcon, LinkRoot, LinkText } from "./SlackAppsLink.styled";

export interface SlackAppsLinkProps {
  manifest?: string;
}

const SlackAppsLink = ({ manifest }: SlackAppsLinkProps): JSX.Element => {
  const link = manifest
    ? `/apps?new_app=1&manifest_yaml=${encodeURIComponent(manifest)}`
    : "/apps";

  return (
    <LinkRoot
      className="Button Button--primary"
      href={`https://api.slack.com${link}`}
    >
      <LinkText>{`Open Slack Apps`}</LinkText>
      <LinkIcon name="external" />
    </LinkRoot>
  );
};

export default SlackAppsLink;
