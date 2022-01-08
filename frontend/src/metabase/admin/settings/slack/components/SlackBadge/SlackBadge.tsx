import React from "react";
import { t } from "ttag";
import { BadgeRoot, BadgeIcon, BadgeText } from "./SlackBadge.styled";

export interface SlackBadgeProps {
  hasSlackBot?: boolean;
  hasSlackError?: boolean;
}

const SlackBadge = ({
  hasSlackBot,
  hasSlackError,
}: SlackBadgeProps): JSX.Element => {
  return (
    <BadgeRoot>
      <BadgeIcon hasSlackError={hasSlackError} />
      <BadgeText hasSlackError={hasSlackError}>
        {getMessage(hasSlackBot, hasSlackError)}
      </BadgeText>
    </BadgeRoot>
  );
};

const getMessage = (hasSlackBot?: boolean, hasSlackError?: boolean): string => {
  if (hasSlackBot) {
    return hasSlackError
      ? t`Slack bot is not working.`
      : t`Slack bot is working.`;
  } else {
    return hasSlackError
      ? t`Slack app is not working.`
      : t`Slack app is working`;
  }
};

export default SlackBadge;
