import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { ReferencedEntityKind } from "metabase/viz-core";

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
  kind: ReferencedEntityKind | undefined;
  name: string | undefined;
  url: string | undefined;
  columns: ColumnOption[];
  isLoading: boolean;
  hasError: boolean;
};
