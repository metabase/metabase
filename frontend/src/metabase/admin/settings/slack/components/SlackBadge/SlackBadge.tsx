import { t } from "ttag";

import { BadgeRoot, BadgeIcon, BadgeText } from "./SlackBadge.styled";

export interface SlackBadgeProps {
  isBot?: boolean;
  isValid?: boolean;
}

const SlackBadge = ({ isBot, isValid }: SlackBadgeProps): JSX.Element => {
  return (
    <BadgeRoot>
      <BadgeIcon isValid={isValid} />
      <BadgeText isValid={isValid}>{getMessage(isBot, isValid)}</BadgeText>
    </BadgeRoot>
  );
};

const getMessage = (isBot?: boolean, isValid?: boolean): string => {
  if (isBot) {
    return isValid ? t`Slack bot is working.` : t`Slack bot is not working.`;
  } else {
    return isValid ? t`Slack app is working` : t`Slack app is not working.`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackBadge;
