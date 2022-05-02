// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { TYPE } from "metabase/lib/types";

import Field from "../metadata/Field";
import { Metadata } from "../metadata/Metadata";
import StructuredQuery from "../queries/StructuredQuery";
import Dimension from "./Dimension";
// These types aren't aggregated. e.g. if you take the distinct count of a FK
// column, you now have a normal integer and should see relevant filters for
// that type.
const UNAGGREGATED_SEMANTIC_TYPES = new Set([TYPE.FK, TYPE.PK]);

/**
 * Aggregation reference, `["aggregation", aggregation-index]`
 */
export default class AggregationDimension extends Dimension {
  _aggregationIndex: number;

  static parseMBQL(
    mbql: any,
    metadata?: Metadata | null | undefined,
    query?: StructuredQuery | null | undefined,
  ): Dimension | null | undefined {
    if (Array.isArray(mbql) && mbql[0] === "aggregation") {
      const [aggregationIndex, options] = mbql.slice(1);
      return new AggregationDimension(
        aggregationIndex,
        options,
        metadata,
        query,
      );
    }
  }

  constructor(
    aggregationIndex,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(
      null,
      [aggregationIndex, options],
      metadata,
      query,
      Object.freeze(Dimension.normalizeOptions(options)),
    );
    this._aggregationIndex = aggregationIndex;

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  aggregationIndex(): number {
    return this._aggregationIndex;
  }

  column(extra = {}) {
    return { ...super.column(), source: "aggregation", ...extra };
  }

  field() {
    const aggregation = this.aggregation();

    if (!aggregation) {
      return super.field();
    }

    const dimension = aggregation.dimension();
    const field = dimension && dimension.field();
    const { semantic_type } = field || {};
    return new Field({
      name: aggregation.columnName(),
      display_name: aggregation.displayName(),
      base_type: aggregation.baseType(),
      // don't pass through `semantic_type` when aggregating these types
      ...(!UNAGGREGATED_SEMANTIC_TYPES.has(semantic_type) && {
        semantic_type,
      }),
      query: this._query,
      metadata: this._metadata,
    });
  }

  /**
   * Raw aggregation
   */
  _aggregation(): Aggregation {
    return (
      this._query &&
      this._query.aggregations &&
      this._query.aggregations()[this.aggregationIndex()]
    );
  }

  /**
   * Underlying aggregation, with aggregation-options removed
   */
  aggregation() {
    const aggregation = this._aggregation();

    if (aggregation) {
      return aggregation.aggregation();
    }

    return null;
  }

  displayName(): string {
    const aggregation = this._aggregation();

    if (aggregation) {
      return aggregation.displayName();
    }

    return null;
  }

  columnName() {
    const aggregation = this._aggregation();

    if (aggregation) {
      return aggregation.columnName();
    }

    return null;
  }

  mbql() {
    return ["aggregation", this._aggregationIndex, this._options];
  }

  icon() {
    return "int";
  }
}
