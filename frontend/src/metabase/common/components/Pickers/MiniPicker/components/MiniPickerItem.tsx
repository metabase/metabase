import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getIcon } from "metabase/lib/icon";
import { Box, Icon, Menu, type MenuItemProps } from "metabase/ui";

import { useMiniPickerContext } from "../context";
import type {
  MiniPickerCollectionItem,
  MiniPickerItem as MiniPickerItemType,
} from "../types";

export const MiniPickerItem = ({
  model,
  name,
  onClick,
  isFolder,
  display,
  ...menuItemProps
}: {
  name: string;
  model?: MiniPickerItemType["model"];
  display?: MiniPickerCollectionItem["display"];
  onClick?: () => void;
  isFolder?: boolean;
} & MenuItemProps) => {
  const { isCompact } = useMiniPickerContext();
  return (
    <Box px="sm" py="2px">
      <Menu.Item
        leftSection={
          model ? <Icon {...getIcon({ model, display })} /> : undefined
        }
        rightSection={isFolder ? <Icon name="chevronright" /> : undefined}
        onClick={onClick}
        {...menuItemProps}
      >
        <Ellipsified
          maw={
            isFolder
              ? isCompact
                ? "9rem"
                : "13rem"
              : isCompact
                ? "12rem"
                : "16rem"
          }
        >
          {name}
        </Ellipsified>
      </Menu.Item>
    </Box>
  );
};
