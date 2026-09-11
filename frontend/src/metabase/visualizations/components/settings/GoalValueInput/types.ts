import type { OmniPickerItem } from "metabase/common/components/Pickers";

export type ColumnOption = {
  name: string;
  label: string;
};

export type PickedItem = {
  id: OmniPickerItem["id"];
  model: OmniPickerItem["model"];
  name: string;
};

export type ReferencedEntityInfo = {
  name: string | undefined;
  columns: ColumnOption[];
  isLoading: boolean;
  hasError: boolean;
};
