import { Box, Ellipsified, Icon, Menu, type MenuItemProps } from "metabase/ui";
import { getIcon } from "metabase/utils/icon";

import type {
  MiniPickerCollectionItem,
  MiniPickerItem as MiniPickerItemType,
} from "../types";

import styles from "./MiniPickerItem.module.css";

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
  return (
    <Box px="sm" py="2px">
      <Menu.Item
        leftSection={
          model ? <Icon {...getIcon({ model, display })} /> : undefined
        }
        rightSection={isFolder ? <Icon name="chevronright" /> : undefined}
        onClick={onClick}
        classNames={{
          itemLabel: styles.section,
          itemSection: styles.section,
        }}
        {...menuItemProps}
      >
        <Ellipsified>{name}</Ellipsified>
      </Menu.Item>
    </Box>
  );
};
