import Field from "metabase-lib/lib/metadata/Field";
import { SavedCard, NativeDatasetQuery } from "metabase-types/types/Card";

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
  "updated-at": string;
  "created-at": string;
}
