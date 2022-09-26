import { PlainObjectType } from "../Base/types";
import type Database from "../Database";
import type Table from "../Table";

export type SchemaProps = PlainObjectType & {
  id?: string;
  name: string;
  database: Database;
  tables: Table[];
};
