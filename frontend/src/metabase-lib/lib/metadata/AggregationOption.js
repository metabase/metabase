import Base from "metabase-lib/lib/metadata/Base";
import AggregationWrapper from "metabase-lib/lib/queries/Aggregation";
import type { Field } from "metabase/meta/types/Field";

/**
 * Wrapper class for an aggregation object
 */
export default class AggregationOption extends Base {
  name: string;
  short: string;
  // TODO: Now just a plain object; wrap to a Field wrapper class
  fields: Field[];
  validFieldsFilters: [(fields: Field[]) => Field[]];

  /**
   * Aggregation has one or more required fields
   */
  hasFields(): boolean {
    return this.validFieldsFilters.length > 0;
  }

  toAggregation(): AggregationWrapper {
    return new AggregationWrapper(
      null,
      [this.short].concat(this.fields.map(field => null)),
    );
  }
}
