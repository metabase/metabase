import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

import { useMiniPickerContext } from "../context";

import { MiniPickerItem } from "./MiniPickerItem";

export function MiniPickerFooter() {
  const { canBrowse, onBrowseAll } = useMiniPickerContext();

  if (!canBrowse) {
    return null;
  }
  return (
    <>
      <Menu.Divider mx="sm" />
      <MiniPickerItem
        variant="mb-light"
        leftSection={<Icon name="search" />}
        name={t`Browse all`}
        onClick={onBrowseAll}
      />
    </>
  );
}
