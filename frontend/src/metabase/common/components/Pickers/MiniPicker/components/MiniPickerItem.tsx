import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getIcon } from "metabase/lib/icon";
import { Box, Icon, Menu, type MenuItemProps } from "metabase/ui";

import type { MiniPickerItem as MiniPickerItemType } from "../types";

export const MiniPickerItem = ({
  model,
  name,
  onClick,
  isFolder,
  isHidden,
  ...menuItemProps
}: {
  name: string;
  model?: MiniPickerItemType["model"];
  onClick?: () => void;
  isFolder?: boolean;
  isHidden?: boolean;
} & MenuItemProps) => {
  if (isHidden) {
    return null;
  }
  return (
    <Box px="sm" py="2px">
      <Menu.Item
        leftSection={model ? <Icon {...getIcon({ model })} /> : undefined}
        rightSection={isFolder ? <Icon name="chevronright" /> : undefined}
        onClick={onClick}
        {...menuItemProps}
      >
        <Ellipsified maw={isFolder ? "13rem" : "16rem"}>{name}</Ellipsified>
      </Menu.Item>
    </Box>
  );
};
