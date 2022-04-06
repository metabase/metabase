import { titleize, humanize } from "metabase/lib/formatting";
import Database from "./Database";
import Table from "./Table";
import Metadata, { EMPTY_METADATA_INSTANCE } from "./Metadata";

export interface ISchema {
  id: string;
  name: string;
  database: number;
}

export type HydratedSchemaProperties = {
  database: Database;
  tables: Table[];
  metadata: Metadata;
};

export default class Schema {
  id: string;
  name: string;

  database: Database;
  tables: Table[] | null;
  metadata: Metadata;

  _plainObject: ISchema;

  constructor(
    schema: Omit<ISchema, "database"> &
      Pick<HydratedSchemaProperties, "database">,
  ) {
    this.id = schema.id;
    this.name = schema.name;

    // we replace the original database property with an instance of Database
    // in metabase/selectors/metadata before instantiating Schemas
    this.database = schema.database;

    // these properties are hydrated after instantiation in metabase/selectors/metadata
    this.metadata = EMPTY_METADATA_INSTANCE;
    this.tables = null;

    // Assign all properties to the instance from the `schema` object in case
    // there is old, un-typed code that relies on properties missing from ISchema
    Object.assign(this, schema);

    this._plainObject = {
      ...schema,
      database: schema.database.id,
    };
  }

  displayName() {
    return titleize(humanize(this.name));
  }

  getTables(): Table[] {
    return this.tables ?? [];
  }
}
