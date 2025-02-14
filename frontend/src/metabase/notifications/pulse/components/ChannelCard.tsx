import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Flex, Icon, Paper, Text } from "metabase/ui";

export const ChannelCard = ({
  onClick,
  title,
  channel,
}: {
  onClick?: () => void;
  title: string;
  channel: "email" | "slack";
}) => {
  const iconName = channel === "email" ? "mail" : "slack_colorized";

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      shadow="none"
      onClick={onClick}
      className={cx(CS.cursorPointer, CS.bgLightHover, CS.textBrandHover)}
    >
      <Flex align="center" gap="sm">
        <Icon name={iconName} c="brand" />
        <Text fw={700} c="inherit">
          {title}
        </Text>
      </Flex>
    </Paper>
  );
};
