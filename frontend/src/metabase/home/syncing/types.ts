export interface User {
  id: number;
  is_superuser: boolean;
}

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: number;
  tables: Table[];
}

export interface Table {
  id: number;
}
