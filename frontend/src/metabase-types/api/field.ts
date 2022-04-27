export interface Field {
  id: number;
  table_id: number;
  name: string;
  base_type: string;
  description: string | null;
  nfc_path: string[] | null;
}
