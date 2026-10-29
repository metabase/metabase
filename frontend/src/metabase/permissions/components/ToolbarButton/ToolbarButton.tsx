import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Flex, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ToolbarButton.module.css";

interface ToolbarButtonProps {
  text: string;
  icon: IconName;
  onClick?: () => void;
}

export const ToolbarButton = ({ onClick, text, icon }: ToolbarButtonProps) => {
  return (
    <Flex
      component="button"
      className={cx(S.button, CS.cursorPointer)}
      align="center"
      fw={700}
      py="xxs"
      px="md"
      onClick={onClick}
    >
      <Icon name={icon} mr="xxs" />
      <Text>{text}</Text>
    </Flex>
  );
};
