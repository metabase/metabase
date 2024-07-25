import type { MouseEvent } from "react";

import { Button, Icon, Tooltip } from "metabase/ui";

import S from "./WidgetStatusButton.module.css";
import type { Status } from "./types";
import { getStatusConfig } from "./utils";

type Props = {
  status: Status;
  onClick?: () => void;
};

const BUTTON_SIZE = 28;
const ICON_SIZE = 12;

export const WidgetStatusButton = ({ status, onClick }: Props) => {
  const { disabled, icon, label } = getStatusConfig(status);

  const handleClick = (event: MouseEvent) => {
    if (onClick) {
      event.stopPropagation();
      onClick();
    }
  };

  return (
    <Tooltip disabled={!label} label={label}>
      <Button
        className={S.root}
        compact
        disabled={disabled}
        leftIcon={<Icon name={icon} size={ICON_SIZE} />}
        radius="md"
        variant="subtle"
        w={BUTTON_SIZE}
        h={BUTTON_SIZE}
        onClick={handleClick}
      />
    </Tooltip>
  );
};
