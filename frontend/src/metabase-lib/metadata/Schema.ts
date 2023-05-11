import { humanize, titleize } from "metabase/lib/formatting";
import { NormalizedSchema } from "metabase-types/api";
import type Metadata from "./Metadata";
import type Database from "./Database";
import type Table from "./Table";

export default class Schema {
  private readonly schema: NormalizedSchema;
  metadata?: Metadata;
  database?: Database;
  tables: Table[] = [];

  constructor(schema: NormalizedSchema) {
    this.schema = schema;
  }

  get id() {
    return this.schema.id;
  }

  get name() {
    return this.schema.name;
  }

  getPlainObject() {
    return this.schema;
  }

  displayName() {
    return this.name ? titleize(humanize(this.name)) : null;
  }

  getTables() {
    return this.tables;
  }
}
