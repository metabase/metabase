/* @flow weak */

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Schema from "./Schema";
import Field from "./Field";

import Dimension from "../Dimension";

import { singularize } from "metabase/lib/formatting";
import { getAggregationOperatorsWithFields } from "metabase/lib/schema_metadata";
import { memoize, createLookupByProperty } from "metabase-lib/lib/utils";

import type { SchemaName } from "metabase-types/types/Table";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type EntityType = string; // TODO: move somewhere central

/** This is the primary way people interact with tables */
export default class Table extends Base {
  description: string;

  db: Database;

  schema: ?Schema;
  // @deprecated: use schema.name (all tables should have a schema object, in theory)
  schema_name: ?SchemaName;

  fields: Field[];

  entity_type: ?EntityType;

  hasSchema(): boolean {
    return (this.schema_name && this.db && this.db.schemas.length > 1) || false;
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
      databaseId: this.db && this.db.id,
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

  // AGGREGATIONS

  @memoize
  aggregationOperators() {
    return getAggregationOperatorsWithFields(this);
  }

  @memoize
  aggregationOperatorsLookup() {
    return createLookupByProperty(this.aggregationOperators(), "short");
  }

  aggregationOperator(short) {
    return this.aggregation_operators_lookup[short];
  }

  // @deprecated: use aggregationOperators
  // $FlowFixMe: known to not have side-effects
  get aggregation_operators() {
    return this.aggregationOperators();
  }

  // @deprecated: use aggregationOperatorsLookup
  // $FlowFixMe: known to not have side-effects
  get aggregation_operators_lookup() {
    return this.aggregationOperatorsLookup();
  }

  // FIELDS

  @memoize
  fieldsLookup() {
    return createLookupByProperty(this.fields, "id");
  }

  // @deprecated: use fieldsLookup
  // $FlowFixMe: known to not have side-effects
  get fields_lookup() {
    return this.fieldsLookup();
  }
}
