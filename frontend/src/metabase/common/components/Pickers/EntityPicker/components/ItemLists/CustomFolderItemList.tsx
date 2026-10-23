import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { useTranslateContent } from "metabase/content-translation/hooks";

import type { EntityPickerCustomFolder } from "../../types";

import { PickerColumn, PickerItemRow } from "./PickerItemRow";

export const CustomFolderItemList = ({
  folder,
}: {
  folder: EntityPickerCustomFolder;
}) => {
  const tc = useTranslateContent();

  return (
    <VirtualizedList
      Wrapper={PickerColumn}
      scrollTo={folder.items.findIndex((item) => item.isSelected)}
      estimatedItemSize={37}
    >
      {folder.items.map((item) => (
        <PickerItemRow
          key={item.id}
          label={tc(item.name)}
          icon={{
            name: item.icon,
            c: item.isSelected ? "text-primary-inverse" : "core-brand",
          }}
          isSelected={Boolean(item.isSelected)}
          // a custom folder is a root folder, so its items are the last column
          isCurrentLevel
          containerProps={{ pb: "xxs" }}
          onClick={item.onSelect}
        />
      ))}
    </VirtualizedList>
  );
};
