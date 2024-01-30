import { t } from "ttag";

import { entityForObject } from "metabase/lib/schema";
import type { PickerItem } from "./types";
import { QuestionPicker } from "./SpecificEntityPickers/QuestionPicker";
import { TablePicker } from "./SpecificEntityPickers/TablePicker";
import { CollectionPicker } from "./SpecificEntityPickers/CollectionPicker";

export const getIcon = (item: PickerItem) => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item)?.name || "table";
};

export const isSelectedItem = (
  item: PickerItem,
  selectedItem: PickerItem | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};

export const tabOptions = {
  question: {
    label: t`Questions`,
    component: QuestionPicker,
  },
  table: {
    label: t`Tables`,
    component: TablePicker,
  },
  collection: {
    label: t`Collections`,
    component: CollectionPicker,
  },
};

export type ValidTab = keyof typeof tabOptions;
