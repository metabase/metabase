import { humanize, titleize } from "metabase/lib/formatting";
import type { NormalizedSchema } from "metabase-types/api";

import type Database from "./Database";
import type Metadata from "./Metadata";
import type Table from "./Table";

interface Schema extends Omit<NormalizedSchema, "database" | "tables"> {
  database?: Database;
  tables?: Table[];
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Schema {
  private readonly _plainObject: NormalizedSchema;

  constructor(schema: NormalizedSchema) {
    this._plainObject = schema;
    Object.assign(this, schema);
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name ? titleize(humanize(this.name)) : null;
  }

  getTables() {
    return this.tables ?? [];
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schema;
