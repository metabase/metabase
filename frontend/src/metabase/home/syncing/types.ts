export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  tables: Table[];
}

export interface Table {
  id: number;
}
