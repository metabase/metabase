import { PlainObjectType } from "../Base/types";
import Database from "../Database";
import Table from "../Table";

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

export type MetricProps = Overwrite<
  PlainObjectType,
  {
    name: string;
    description: string;
    database: Database;
    table: Table;
    id: number;
    definition: string;
    archived: boolean;
  }
>;
