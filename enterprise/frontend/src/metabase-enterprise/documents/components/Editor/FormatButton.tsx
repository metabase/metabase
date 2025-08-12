import type React from "react";

import type { IconName } from "metabase/ui";
import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

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
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isActive
            ? "var(--mb-color-brand)"
            : "var(--mb-color-text-dark)",
          backgroundColor: isActive
            ? "var(--mb-color-bg-light)"
            : "transparent",
          fontSize: text ? "14px" : undefined,
          fontWeight: text ? "bold" : undefined,
          border: "none",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onClick={onClick}
      >
        {icon ? <Icon name={icon} size={16} /> : text}
      </UnstyledButton>
    </Tooltip>
  );
};
