/* @flow weak */

import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Field from "./Field";

import type { SchemaName } from "metabase/meta/types/Table";

import Dimension from "../Dimension";

import _ from "underscore";
import type { FieldMetadata } from "metabase/meta/types/Metadata";

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
}
