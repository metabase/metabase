import { humanize, titleize } from "metabase/lib/formatting";
import { NormalizedSchema } from "metabase-types/api";
import type Metadata from "./Metadata";
import type Database from "./Database";
import type Table from "./Table";

export default class Schema {
  id: string;
  name: string;
  metadata?: Metadata;
  database?: Database;
  tables?: Table[];

  constructor(schema: NormalizedSchema) {
    this.id = schema.id;
    this.name = schema.name;
  }

  displayName() {
    return this.name ? titleize(humanize(this.name)) : null;
  }

  getTables() {
    return this.tables;
  }
}
