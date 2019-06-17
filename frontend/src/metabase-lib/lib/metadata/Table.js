/* @flow weak */

// NOTE: this needs to be imported first due to some cyclical dependency nonsense
import Q_DEPRECATED from "metabase/lib/query";

import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Field from "./Field";

import type { SchemaName } from "metabase/meta/types/Table";
import type { FieldMetadata } from "metabase/meta/types/Metadata";
import type { ConcreteField, DatetimeUnit } from "metabase/meta/types/Query";

import { titleize, humanize } from "metabase/lib/formatting";

import Dimension from "../Dimension";

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
    let question = Question.create({
      databaseId: this.db_id,
      tableId: this.id,
      metadata: this.metadata,
    });
    // NOTE: special case for Google Analytics which doesn't allow raw queries:
    if (this.entity_type === "entity/GoogleAnalyticsTable") {
      const dateField = _.findWhere(this.fields, { name: "ga:date" });
      if (dateField) {
        question = question
          .query()
          .addFilter(["time-interval", ["field-id", dateField.id], -365, "day"])
          .addAggregation(["metric", "ga:users"])
          .addAggregation(["metric", "ga:pageviews"])
          .addBreakout(["datetime-field", ["field-id", dateField.id], "week"])
          .question()
          .setDisplay("line");
      }
    }
    return question;
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

  fieldTarget(
    fieldRef: ConcreteField,
  ): { field: Field, table: Table, unit?: DatetimeUnit, path: Field[] } {
    return Q_DEPRECATED.getFieldTarget(fieldRef, this);
  }
}
