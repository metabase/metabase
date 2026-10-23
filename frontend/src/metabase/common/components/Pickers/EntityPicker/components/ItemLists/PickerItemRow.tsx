import type React from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { IconData } from "metabase/common/utils/icon";
import {
  Box,
  type BoxProps,
  Icon,
  NavLink,
  type NavLinkProps,
  Tooltip,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

export const PickerColumn = ({
  children,
  ...props
}: {
  children: React.ReactNode;
}) => (
  <Box p="1rem" {...props}>
    {children}
  </Box>
);

type PickerItemRowProps = {
  label: React.ReactNode;
  icon: IconData & { c?: ColorName };
  isSelected: boolean;
  isCurrentLevel: boolean;
  isFolder?: boolean;
  isDisabled?: boolean;
  tooltip?: string;
  containerProps?: BoxProps;
  navLinkProps?: NavLinkProps;
  onClick: () => void;
};

export function PickerItemRow({
  label,
  icon,
  isSelected,
  isCurrentLevel,
  isFolder = false,
  isDisabled = false,
  tooltip,
  containerProps,
  navLinkProps,
  onClick,
}: PickerItemRowProps) {
  return (
    <Box data-testid="picker-item" {...containerProps}>
      <Tooltip label={tooltip} disabled={!tooltip} position="right">
        <NavLink
          w={"auto"}
          disabled={isDisabled}
          style={isDisabled && tooltip ? { pointerEvents: "all" } : undefined}
          rightSection={
            isFolder ? <Icon name="chevronright" size={10} /> : null
          }
          mb={0}
          label={label}
          active={isSelected}
          leftSection={<EntityIcon {...icon} />}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault(); // prevent form submission
            e.stopPropagation(); // prevent parent onClick

            if (!isDisabled) {
              onClick();
            }
          }}
          variant={isCurrentLevel ? "primary" : "secondary"}
          {...navLinkProps}
        />
      </Tooltip>
    </Box>
  );
}
