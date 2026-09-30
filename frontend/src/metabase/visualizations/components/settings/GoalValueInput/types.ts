import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { VisualizationSettings } from "metabase-types/api";

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
  url: string | undefined;
  columns: ColumnOption[];
  visualizationSettings: VisualizationSettings | undefined;
  isLoading: boolean;
  hasError: boolean;
};
