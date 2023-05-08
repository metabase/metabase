import type { ConcreteField } from "./field";
import type { Table } from "./table";

type ForeignKeyField = ConcreteField & {
  table: Table;
};

export interface ForeignKey {
  destination: ForeignKeyField;
  destination_id: number;
  origin: ForeignKeyField;
  origin_id: number;
  relationship: string; // enum?
}
