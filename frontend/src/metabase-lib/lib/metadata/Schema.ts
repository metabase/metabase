import { titleize, humanize } from "metabase/lib/formatting";
import Database from "./Database";
import Table from "./Table";
import Metadata from "./Metadata";

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

  database: Database | number | null;
  tables: Table[] | null;
  metadata: Metadata | null;

  _plainObject: ISchema;

  constructor(schema: ISchema) {
    this.id = schema.id;
    this.name = schema.name;

    // these properties are hydrated after instantiation in metabase/selectors/metadata
    this.metadata = null;
    this.tables = null;
    this.database = null;

    // Assign all properties to the instance from the `schema` object in case
    // there is old, un-typed code that relies on properties missing from ISchema
    Object.assign(this, schema);

    this._plainObject = {
      ...schema,
    };
  }

  displayName() {
    return titleize(humanize(this.name));
  }

  getTables(): Table[] {
    return this.tables ?? [];
  }

  getDatabase(): Database {
    if (this.database instanceof Database) {
      return this.database;
    }

    const dbFromMetadata = this.metadata?.database(this.database);
    if (dbFromMetadata) {
      return dbFromMetadata;
    }

    throw new Error("Database not found.");
  }

  getDatabaseId(): number {
    return this._plainObject.database;
  }

  getPlainObject() {
    return this._plainObject;
  }
}
