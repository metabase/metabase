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

import Dimension from "../Dimension";

import _ from "underscore";

/** This is the primary way people interact with tables */
export default class Table extends Base {
  displayName: string;
  description: string;

  schema: ?SchemaName;
  db: Database;

  fields: FieldMetadata[];

  // $FlowFixMe Could be replaced with hydrated database property in selectors/metadata.js (instead / in addition to `table.db`)
  get database() {
    return this.db;
  }

  newQuestion(): Question {
    // $FlowFixMe
    return new Question();
  }

  dimensions(): Dimension[] {
    return this.fields.map(field => field.dimension());
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
