import { getIcon } from "metabase/lib/icon";
import { Icon, NavLink } from "metabase/ui";

import type { MiniPickerItem as MiniPickerItemType } from "../types";

export const MiniPickerItem = ({
  model,
  name,
  onClick,
  isFolder,
  isHidden,
}: {
  model: MiniPickerItemType["model"];
  name: string;
  onClick?: () => void;
  isFolder?: boolean;
  isHidden?: boolean;
}) => {
  if (isHidden) {
    return null;
  }
  return (
    <NavLink
      leftSection={<Icon {...getIcon({ model })} />}
      rightSection={isFolder ? <Icon name="chevronright" /> : undefined}
      label={name}
      onClick={onClick}
      variant="mb-light"
    />
  );
};
