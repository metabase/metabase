export interface Field {
  id: number;
  dimensions?: FieldDimension;
  display_name: string;
  table_id: number;
  name: string;
  base_type: string;
  description: string | null;
  nfc_path: string[] | null;
}

export type FieldDimension = {
  name: string;
};
