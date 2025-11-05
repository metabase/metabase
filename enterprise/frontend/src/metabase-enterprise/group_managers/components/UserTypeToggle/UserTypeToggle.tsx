import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { type FloatingPosition, Icon, Tooltip } from "metabase/ui";

import { UserTypeToggleRoot } from "./UserTypeToggle.styled";

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
      <UserTypeToggleRoot
        aria-label={tooltipText}
        data-testid="user-type-toggle"
        onClick={handleChangeType}
      >
        <Icon name={icon} />
      </UserTypeToggleRoot>
    </Tooltip>
  );
};
