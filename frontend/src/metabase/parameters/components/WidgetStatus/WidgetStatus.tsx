import type { MouseEvent } from "react";
import { t } from "ttag";

import { Button, Flex, Icon, rem, Tooltip } from "metabase/ui";

import type { Status } from "./types";

type Props = {
  className?: string;
  highlighted?: boolean;
  status: Status;
  onClick?: () => void;
};

const COMPACT_BUTTON_PADDING = 4;

/**
 * Account for compact button's padding, so that the placement of this component's root element
 * is the same regardless of whether the button is rendered or not.
 */
const BUTTON_MARGIN = -COMPACT_BUTTON_PADDING;

export const WidgetStatus = ({
  className,
  highlighted,
  status,
  onClick,
}: Props) => {
  const handleClick = (event: MouseEvent) => {
    if (onClick) {
      event.stopPropagation();
      onClick();
    }
  };

  return (
    <Flex
      align="center"
      className={className}
      h={0} // trick to prevent this element from affecting parent's height
      ml="auto"
    >
      {status === "clear" && (
        <Tooltip label={t`Clear`}>
          <Button
            aria-label={t`Clear`}
            color={highlighted ? undefined : "text-medium"}
            compact
            leftIcon={<Icon name="close" />}
            m={rem(BUTTON_MARGIN)}
            radius="md"
            variant="subtle"
            onClick={handleClick}
          />
        </Tooltip>
      )}

      {status === "reset" && (
        <Tooltip label={t`Reset filter to default state`}>
          <Button
            aria-label={t`Reset filter to default state`}
            color={highlighted ? undefined : "text-medium"}
            compact
            leftIcon={<Icon name="revert" />}
            m={rem(BUTTON_MARGIN)}
            radius="md"
            variant="subtle"
            onClick={handleClick}
          />
        </Tooltip>
      )}

      {status === "empty" && <Icon name="chevrondown" />}

      {status === "none" && <Icon name="empty" />}
    </Flex>
  );
};
