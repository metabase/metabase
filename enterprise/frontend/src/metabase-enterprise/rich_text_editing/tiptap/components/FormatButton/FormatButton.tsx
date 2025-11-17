import type React from "react";

import type { IconName } from "metabase/ui";
import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./FormatButton.module.css";

interface FormatButtonProps {
  isActive: boolean;
  onClick: () => void;
  tooltip: string;
  icon?: IconName;
  text?: string;
}

export const FormatButton: React.FC<FormatButtonProps> = ({
  isActive,
  onClick,
  tooltip,
  icon,
  text,
}) => {
  return (
    <Tooltip label={tooltip} position="top">
      <UnstyledButton
        w="32px"
        h="32px"
        display="flex"
        c={isActive ? "var(--mb-color-brand)" : "var(--mb-color-text-primary)"}
        bg={isActive ? "var(--mb-color-background-secondary)" : "transparent"}
        fz={14}
        fw="bold"
        className={S.button}
        onClick={onClick}
      >
        {icon ? <Icon name={icon} size={16} /> : text}
      </UnstyledButton>
    </Tooltip>
  );
};
