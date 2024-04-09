import type { MouseEventHandler } from "react";
import type { Placement } from "tippy.js";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import { UserTypeToggleRoot } from "./UserTypeToggle.styled";

interface UserTypeCellProps {
  isManager: boolean;
  onChange: (isManager: boolean) => void;
  tooltipPlacement?: Placement;
}
export const UserTypeToggle = ({
  isManager,
  onChange,
  tooltipPlacement = "right",
}: UserTypeCellProps) => {
  const tooltipText = isManager ? t`Turn into Member` : t`Turn into Manager`;
  const icon = isManager ? "arrow_down" : "arrow_up";

  const handleChangeType: MouseEventHandler = e => {
    e.stopPropagation();
    onChange(!isManager);
  };

  return (
    <Tooltip tooltip={tooltipText} placement={tooltipPlacement}>
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
