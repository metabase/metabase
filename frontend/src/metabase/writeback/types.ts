import Field from "metabase-lib/lib/metadata/Field";
import { SavedCard, NativeDatasetQuery } from "metabase-types/types/Card";
import { ParameterId, ParameterTarget } from "metabase-types/types/Parameter";

export interface CategoryWidgetProps {
  field: {
    value: string;
    onChange: (value: string) => void;
  };
  formField: {
    fieldInstance: Field;
  };
}

export type WritebackActionCard = SavedCard<NativeDatasetQuery> & {
  is_write: true;
};

export interface WritebackAction {
  id: number;
  type: "row";
  card: WritebackActionCard;
  card_id: number;
  "updated-at": string;
  "created-at": string;
}

export interface WritebackActionEmitter {
  id: number;
  dashboard_id: number;
  action: WritebackAction & {
    emitter_id: number;
  };
  parameter_mappings: Record<ParameterId, ParameterTarget>;
  updated_at: string;
  created_at: string;
}
