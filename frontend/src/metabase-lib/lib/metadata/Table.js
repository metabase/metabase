/* @flow weak */

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Field from "./Field";

import type { SchemaName } from "metabase/meta/types/Table";
import type { FieldMetadata } from "metabase/meta/types/Metadata";

import { titleize, humanize } from "metabase/lib/formatting";

import Dimension from "../Dimension";

import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type EntityType = string; // TODO: move somewhere central

import _ from "underscore";

/** This is the primary way people interact with tables */
export default class Table extends Base {
  description: string;

  schema: ?SchemaName;
  db: Database;

  fields: FieldMetadata[];

  entity_type: ?EntityType;

  hasSchema(): boolean {
    return (this.schema && this.db.schemaNames().length > 1) || false;
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
      (includeSchema && this.schema
        ? titleize(humanize(this.schema)) + "."
        : "") + this.display_name
    );
  }

  dateFields(): Field[] {
    return this.fields.filter(field => field.isDate());
  }

  aggregations() {
    return this.aggregation_options || [];
  }

  aggregation(agg) {
    return _.findWhere(this.aggregations(), { short: agg });
  }
}
