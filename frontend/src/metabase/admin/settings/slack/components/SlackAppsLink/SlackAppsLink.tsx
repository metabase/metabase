import { t } from "ttag";
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
      <LinkText>{t`Create Slack App`}</LinkText>
      <LinkIcon name="external" />
    </LinkRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackAppsLink;
