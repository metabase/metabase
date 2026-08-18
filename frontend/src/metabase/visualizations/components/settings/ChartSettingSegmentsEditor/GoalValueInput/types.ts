import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { CardId, MeasureId } from "metabase-types/api";

export type GoalEntityRef =
  | { type: "card"; id: CardId }
  | { type: "measure"; id: MeasureId };

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
