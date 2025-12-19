import type { MouseEvent } from "react";
import { t } from "ttag";

import { Box, Flex, Icon, Tooltip } from "metabase/ui";

import type { Status } from "./types";

type Props = {
  className?: string;
  highlighted?: boolean;
  status: Status;
  onClick?: () => void;
};

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
          <Box
            aria-label={t`Clear`}
            h={24}
            pt={4}
            pb={4}
            onClick={handleClick}
            role="button"
          >
            <Icon
              name="close"
              c={highlighted ? undefined : "text-secondary"}
              size={16}
            />
          </Box>
        </Tooltip>
      )}

      {status === "reset" && (
        <Tooltip label={t`Reset filter to default state`}>
          <Box
            aria-label={t`Reset filter to default state`}
            h={24}
            pt={4}
            pb={4}
            onClick={handleClick}
            role="button"
          >
            <Icon
              name="revert"
              c={highlighted ? undefined : "text-secondary"}
              size={16}
            />
          </Box>
        </Tooltip>
      )}

      {status === "empty" && <Icon size={16} name="chevrondown" />}

      {status === "none" && <Icon name="empty" />}
    </Flex>
  );
};
