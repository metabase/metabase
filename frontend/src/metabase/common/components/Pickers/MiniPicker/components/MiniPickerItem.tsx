import { getIcon } from "metabase/lib/icon";
import { Icon, NavLink } from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

export const MiniPickerItem = ({ model, name, onClick, isFolder, isHidden }: { model: SearchModel, name: string, onClick?: () => void, isFolder?: boolean, isHidden?: boolean }) => {
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
}
