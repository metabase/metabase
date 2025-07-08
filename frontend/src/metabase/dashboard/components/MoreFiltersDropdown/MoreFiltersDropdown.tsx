import { useState } from "react";
import { t } from "ttag";

import { Button, Icon, Popover } from "metabase/ui";

import type { DashboardParameterListProps } from "../DashboardParameterList";
import { DashboardParameterList } from "../DashboardParameterList";

interface MoreFiltersDropdownProps
  extends Omit<DashboardParameterListProps, "parameters"> {
  parameters: DashboardParameterListProps["parameters"];
  onClose?: () => void;
}

export function MoreFiltersDropdown({
  parameters,
  onClose,
  ...otherProps
}: MoreFiltersDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  if (!parameters || parameters.length === 0) {
    return null;
  }

  return (
    <Popover opened={isOpen} onClose={handleClose}>
      <Popover.Target>
        <Button variant="subtle" onClick={handleToggle}>
          <Icon name="filter" size={16} />
          {t`More Filters`} ({parameters.length})
          <Icon name="chevrondown" size={16} />
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <DashboardParameterList
          parameters={parameters}
          vertical={true}
          {...otherProps}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
