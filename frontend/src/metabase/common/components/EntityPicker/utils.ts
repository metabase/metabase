import { color } from "metabase/lib/colors";
import type { ObjectWithModel } from "metabase/lib/icon";
import { getIcon } from "metabase/lib/icon";
import type { SearchResultId } from "metabase-types/api";

import type { EntityTab, TypeWithModel } from "./types";

export const getEntityPickerIcon = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  isSelected?: boolean,
) => {
  const icon = getIcon(item as ObjectWithModel);

  if (["person", "group"].includes(icon.name)) {
    // should inherit color
    return icon;
  }

  if (isSelected && !icon.color) {
    icon.color = color("text-white");
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  return { ...icon, color: color(icon.color ?? "brand") };
};

export const isSelectedItem = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  selectedItem: TypeWithModel<Id, Model> | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};

export const computeInitialTab = <
  Item extends TypeWithModel<SearchResultId, Model>,
  Model extends string,
>({
  initialValue,
  tabs,
  hasRecents,
  defaultToRecentTab,
}: {
  initialValue?: Partial<Item>;
  tabs: EntityTab<Model>[];
  hasRecents: boolean;
  defaultToRecentTab: boolean;
}) => {
  if (hasRecents && defaultToRecentTab) {
    return { model: "recents" };
  }
  if (
    initialValue?.model &&
    tabs.some(tab => tab.model === initialValue.model)
  ) {
    return { model: initialValue.model };
  } else {
    return { model: tabs[0].model };
  }
};
