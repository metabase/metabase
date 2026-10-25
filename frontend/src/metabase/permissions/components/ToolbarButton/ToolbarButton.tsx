import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Flex, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { isEmbeddingHubPermissions } from "../../utils/embedding";

import S from "./ToolbarButton.module.css";

interface ToolbarButtonProps {
  text: string;
  icon: IconName;
  onClick?: () => void;
}

/** Hovers purple in the admin and blue in the hub, like AdminTreeNode */
export const ToolbarButton = ({ onClick, text, icon }: ToolbarButtonProps) => {
  const hoverClassName = isEmbeddingHubPermissions()
    ? S.hubButton
    : S.adminButton;

  return (
    <Flex
      component="button"
      className={cx(S.button, hoverClassName, CS.cursorPointer)}
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
