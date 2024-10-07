export type BaseRow = Record<string, any> & { id: number | string };

export type ColumnItem = {
  name: string;
  key: string;
  sortable?: boolean;
};
