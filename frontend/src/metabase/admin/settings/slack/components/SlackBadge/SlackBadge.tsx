import React from "react";
import { t } from "ttag";
import { BadgeRoot, BadgeIcon, BadgeText } from "./SlackBadge.styled";

export interface SlackBadgeProps {
  isBot?: boolean;
  hasError?: boolean;
}

const SlackBadge = ({ isBot, hasError }: SlackBadgeProps): JSX.Element => {
  return (
    <BadgeRoot>
      <BadgeIcon hasError={hasError} />
      <BadgeText hasError={hasError}>{getMessage(isBot, hasError)}</BadgeText>
    </BadgeRoot>
  );
};

const getMessage = (isBot?: boolean, hasError?: boolean): string => {
  if (isBot) {
    return hasError ? t`Slack bot is not working.` : t`Slack bot is working.`;
  } else {
    return hasError ? t`Slack app is not working.` : t`Slack app is working`;
  }
};

export default SlackBadge;
