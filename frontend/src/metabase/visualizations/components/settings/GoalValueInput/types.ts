import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { CardType } from "metabase-types/api";

export type ColumnOption = {
  name: string;
  label: string;
};

export type PickedItem = {
  id: OmniPickerItem["id"];
  model: OmniPickerItem["model"];
  name: string;
};

export type ReferencedEntityKind = CardType | "measure";

export type ReferencedEntityInfo = {
  kind: ReferencedEntityKind | undefined;
  name: string | undefined;
  url: string | undefined;
  columns: ColumnOption[];
  isLoading: boolean;
  hasError: boolean;
};
