export type Database = {
  name: string;
  schemas: Schema[];
  id: number;
  is_saved_questions?: boolean;
};

export type Schema = { displayName: () => string; database: Database };
