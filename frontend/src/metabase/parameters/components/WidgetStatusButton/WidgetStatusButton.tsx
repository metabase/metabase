import type { MouseEvent } from "react";

import { Button, Flex, Icon, Tooltip } from "metabase/ui";

import S from "./WidgetStatusButton.module.css";
import type { Status } from "./types";
import { getStatusConfig } from "./utils";

type Props = {
  iconSize?: number;
  status: Status;
  onClick?: () => void;
};

const ICON_SIZE = 16;

export const WidgetStatusButton = ({
  iconSize = ICON_SIZE,
  status,
  onClick,
}: Props) => {
  const { disabled, icon, label } = getStatusConfig(status);

  const handleClick = (event: MouseEvent) => {
    if (onClick) {
      event.stopPropagation();
      onClick();
    }
  };

  const button = (
    <Button
      compact
      disabled={disabled}
      leftIcon={<Icon name={icon} size={iconSize} />}
      radius="md"
      variant="subtle"
      onClick={handleClick}
    />
  );

  if (label) {
    /**
     * Intentionally do not render the tooltip when there is no label instead of
     * using props such as "disabled" and/or "hidden".
     * There are 2 reasons for it:
     * 1. Tooltip can be hidden immediately once user clicks the button. Otherwise
     *    user would still see the animation of a disappearing tooltip but with no content.
     *    This can be handled with "hidden" prop though.
     * 2. Tooltip won't reappear when focus is automatically brought back to the button but
     *    user isn't hovering the button.
     */
    return (
      <Flex
        align="center"
        className={S.root}
        /* trick to prevent this element from affecting parent's height */
        h={0}
        ml="auto"
      >
        <Tooltip label={label}>{button}</Tooltip>
      </Flex>
    );
  }

  return (
    <Flex
      align="center"
      className={S.root}
      /* trick to prevent this element from affecting parent's height */
      h={0}
      ml="auto"
    >
      {button}
    </Flex>
  );
};
