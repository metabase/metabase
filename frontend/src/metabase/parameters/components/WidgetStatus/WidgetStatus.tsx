import type { MouseEvent } from "react";

import { Button, Flex, Icon, rem, Tooltip } from "metabase/ui";

import S from "./WidgetStatus.module.css";
import type { Status } from "./types";
import { getStatusConfig } from "./utils";

type Props = {
  status: Status;
  onClick?: () => void;
};

export const WidgetStatus = ({ status, onClick }: Props) => {
  const { button, icon, label } = getStatusConfig(status);

  const handleClick = (event: MouseEvent) => {
    if (onClick) {
      event.stopPropagation();
      onClick();
    }
  };

  return (
    <Flex
      align="center"
      className={S.root}
      h={0} // trick to prevent this element from affecting parent's height
      ml="auto"
    >
      {button && (
        <Tooltip label={label}>
          <Button
            aria-label={label}
            compact
            leftIcon={<Icon name={icon} />}
            m={rem(-3)} //account for compact button padding, so that it perfectly aligns with icon when there is no label
            radius="md"
            variant="subtle"
            onClick={handleClick}
          />
        </Tooltip>
      )}

      {!label && <Icon name={icon} />}
    </Flex>
  );
};
