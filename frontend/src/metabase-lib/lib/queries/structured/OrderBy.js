/* @flow */

import MBQLClause from "./MBQLClause";

import type { OrderBy as OrderByObject } from "metabase-types/types/Query";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type Dimension from "metabase-lib/lib/Dimension";
import type Field from "metabase-lib/lib/metadata/Field";

export default class OrderBy extends MBQLClause {
  /**
   * Replaces the order-by clause in the parent query and returns the new StructuredQuery
   * or replaces itself in the parent query if no {orderBy} argument is provided.
   */
  replace(orderBy?: OrderBy | OrderByObject): StructuredQuery {
    if (orderBy != null) {
      return this._query.updateSort(this._index, orderBy);
    } else {
      return this._query.updateSort(this._index, this);
    }
  }

  /**
   * Adds itself to the parent query and returns the new StructuredQuery
   */
  add(): StructuredQuery {
    return this._query.addSort(this);
  }

  /**
   * Removes the order-by in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeSort(this._index);
  }

  /**
   * Returns the display name for the order-by
   */
  displayName(): ?string {
    const dimension = this.dimension();
    return dimension && dimension.render();
  }

  /**
   * Predicate function to test if a given order-by clause is valid
   */
  isValid(): boolean {
    const query = this.query();
    return !query || query.sortOptions(this).hasDimension(this.dimension());
  }

  /**
   * Returns the order-by's Dimension
   */
  dimension(): Dimension {
    return this._query.parseFieldReference(this[1]);
  }

  /**
   * Returns the order-by's Field
   */
  field(): Field {
    return this.dimension().field();
  }
}
