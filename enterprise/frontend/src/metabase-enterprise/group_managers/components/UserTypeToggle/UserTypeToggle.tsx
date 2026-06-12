import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { Box, type FloatingPosition, Icon, Tooltip } from "metabase/ui";

import S from "./UserTypeToggle.module.css";

interface UserTypeCellProps {
  isManager: boolean;
  onChange: (isManager: boolean) => void;
  tooltipPlacement?: FloatingPosition;
}
export const UserTypeToggle = ({
  isManager,
  onChange,
  tooltipPlacement = "right",
}: UserTypeCellProps) => {
  const tooltipText = isManager ? t`Turn into Member` : t`Turn into Manager`;
  const icon = isManager ? "arrow_down" : "arrow_up";

  const handleChangeType: MouseEventHandler = (e) => {
    e.stopPropagation();
    onChange(!isManager);
  };

  return (
    <Tooltip label={tooltipText} position={tooltipPlacement}>
      <Box
        component="button"
        className={S.toggle}
        c="core-filter"
        px="sm"
        py={0}
        aria-label={tooltipText}
        data-testid="user-type-toggle"
        onClick={handleChangeType}
      >
        <Icon name={icon} />
      </Box>
    </Tooltip>
  );
};
