import React from "react";
import { t } from "ttag";
import { BadgeRoot, BadgeIcon, BadgeText } from "./SlackBadge.styled";

export interface SlackBadgeProps {
  isBot: boolean;
  isError: boolean;
}

const SlackBadge = ({ isBot, isError }: SlackBadgeProps): JSX.Element => {
  return (
    <BadgeRoot>
      <BadgeIcon isError={isError} />
      <BadgeText isError={isError}>{getMessage(isBot, isError)}</BadgeText>
    </BadgeRoot>
  );
};

const getMessage = (isBot: boolean, isError: boolean): string => {
  if (isBot) {
    return isError ? t`Slack bot is not working.` : t`Slack bot is working.`;
  } else {
    return isError ? t`Slack app is not working.` : t`Slack app is working`;
  }
};

export default SlackBadge;
