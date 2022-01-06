import React from "react";
import { t } from "ttag";
import { BadgeRoot, BadgeIcon, BadgeText } from "./SlackBadge.styled";

export interface SlackBadgeProps {
  hasBot?: boolean;
  hasError?: boolean;
}

const SlackBadge = ({ hasBot, hasError }: SlackBadgeProps): JSX.Element => {
  return (
    <BadgeRoot>
      <BadgeIcon hasError={hasError} />
      <BadgeText hasError={hasError}>{getMessage(hasBot, hasError)}</BadgeText>
    </BadgeRoot>
  );
};

const getMessage = (hasBot?: boolean, hasError?: boolean): string => {
  if (hasBot) {
    return hasError ? t`Slack bot is not working.` : t`Slack bot is working.`;
  } else {
    return hasError ? t`Slack app is not working.` : t`Slack app is working`;
  }
};

export default SlackBadge;
