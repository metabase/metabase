import { PlainObjectType } from "../Base/types";
import Database from "../Database";
import Table from "../Table";

export type MetricProps = PlainObjectType & {
  name: string;
  description: string;
  database: Database;
  table: Table;
  id: number;
  definition: string;
  archived: boolean;
};
