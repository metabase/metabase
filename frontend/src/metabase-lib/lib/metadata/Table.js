/* @flow weak */

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Schema from "./Schema";
import Field from "./Field";

import type { SchemaName } from "metabase/meta/types/Table";
import type { FieldMetadata } from "metabase/meta/types/Metadata";

import { singularize } from "metabase/lib/formatting";

import Dimension from "../Dimension";

import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type EntityType = string; // TODO: move somewhere central

import _ from "underscore";

/** This is the primary way people interact with tables */
export default class Table extends Base {
  description: string;

  db: Database;

  schema: ?Schema;
  // @deprecated: use schema.name (all tables should have a schema object, in theory)
  schema_name: ?SchemaName;

  fields: FieldMetadata[];

  entity_type: ?EntityType;

  hasSchema(): boolean {
    return (this.schema_name && this.db.schemas.length > 1) || false;
  }

  // $FlowFixMe Could be replaced with hydrated database property in selectors/metadata.js (instead / in addition to `table.db`)
  get database() {
    return this.db;
  }

  newQuestion(): Question {
    return this.question()
      .setDefaultQuery()
      .setDefaultDisplay();
  }

  question(): Question {
    return Question.create({
      databaseId: this.db.id,
      tableId: this.id,
      metadata: this.metadata,
    });
  }

  query(query = {}): StructuredQuery {
    return (
      this.question()
        .query()
        // $FlowFixMe: we know question returns a StructuredQuery but flow doesn't
        .updateQuery(q => ({ ...q, ...query }))
    );
  }

  dimensions(): Dimension[] {
    return this.fields.map(field => field.dimension());
  }

  displayName({ includeSchema } = {}) {
    return (
      (includeSchema && this.schema ? this.schema.displayName() + "." : "") +
      this.display_name
    );
  }

  isQueryable() {
    return this.visibility_type == null;
  }

  /**
   * The singular form of the object type this table represents
   * Currently we try to guess this by singularizing `display_name`, but ideally it would be configurable in metadata
   * See also `field.targetObjectName()`
   */
  objectName() {
    return singularize(this.displayName());
  }

  dateFields(): Field[] {
    return this.fields.filter(field => field.isDate());
  }

  aggregationOperators() {
    return this.aggregation_operators || [];
  }

  aggregation(agg) {
    return _.findWhere(this.aggregationOperators(), { short: agg });
  }
}
