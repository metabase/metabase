import cx from "classnames";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Flex, Icon, Paper, type PaperProps, Text } from "metabase/ui";

const CARD_PROPS = {
  withBorder: true,
  radius: "sm",
  p: "lg",
  shadow: "none",
  className: cx(CS.cursorPointer, CS.bgLightHover, CS.textBrandHover),
} satisfies PaperProps;

type ChannelCardProps = {
  title: string;
  channel: "email" | "slack";
} & ({ onClick: () => void; to?: never } | { to: string; onClick?: never });

export const ChannelCard = ({
  onClick,
  to,
  title,
  channel,
}: ChannelCardProps) => {
  const iconName = channel === "email" ? "mail" : "slack_colorized";

  const content = (
    <Flex align="center" gap="sm">
      <Icon name={iconName} c="core-brand" aria-hidden />
      <Text fw={700} c="inherit">
        {title}
      </Text>
    </Flex>
  );

  if (to === undefined) {
    return (
      <Paper
        {...CARD_PROPS}
        component="button"
        type="button"
        // A native button centers its text.
        ta="left"
        onClick={onClick}
      >
        {content}
      </Paper>
    );
  }

  return (
    <Paper {...CARD_PROPS} component={ForwardRefLink} to={to}>
      {content}
    </Paper>
  );
};
