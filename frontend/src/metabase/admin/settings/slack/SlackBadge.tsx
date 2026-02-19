import { t } from "ttag";

import { Box, Center, type CenterProps, Text } from "metabase/ui";

import S from "./slack.module.css";

export interface SlackBadgeProps extends CenterProps {
  isBot?: boolean;
  isValid?: boolean;
}

export const SlackBadge = ({
  isBot,
  isValid,
  ...props
}: SlackBadgeProps): JSX.Element => {
  const color = isValid ? "success" : "error";

  return (
    <Center {...props}>
      <Box className={S.StatusBadge} bg={color} />
      <Text fw="bold" c={color}>
        {getMessage(isBot, isValid)}
      </Text>
    </Center>
  );
};

const getMessage = (isBot?: boolean, isValid?: boolean): string => {
  if (isBot) {
    return isValid ? t`Slack bot is working.` : t`Slack bot is not working.`;
  } else {
    return isValid ? t`Slack app is working` : t`Slack app is not working.`;
  }
};
