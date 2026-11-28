import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Box, Ellipsified, Icon, Menu, type MenuItemProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";

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
  icon,
  ...menuItemProps
}: {
  name: string;
  model?: MiniPickerItemType["model"];
  display?: MiniPickerCollectionItem["display"];
  onClick?: () => void;
  isFolder?: boolean;
  /** PROTOTYPE: replaces the icon the model would get. */
  icon?: IconName;
} & MenuItemProps) => {
  const getIcon = useGetIcon();
  const modelIcon = model ? getIcon({ model, display }) : undefined;
  const iconProps =
    icon != null ? { ...modelIcon, name: icon, color: undefined } : modelIcon;
  return (
    <Box px="sm" py="2px">
      <Menu.Item
        leftSection={iconProps ? <EntityIcon {...iconProps} /> : undefined}
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
