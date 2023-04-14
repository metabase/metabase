// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { OrderBy as OrderByObject } from "metabase-types/types/Query";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Dimension from "metabase-lib/Dimension";
import Field from "metabase-lib/metadata/Field";
import MBQLClause from "./MBQLClause";
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
  displayName(): string | null | undefined {
    const dimension = this.dimension();
    return dimension && dimension.render();
  }

  /**
   * Predicate function to test if a given order-by clause is valid
   */
  isValid() {
    // Sorting can only be added from the notebook editor, and it's already ported to MLv2.
    // MLv2 guarantees that a query is valid in any given point of time,
    // so we're hardcoding this to true,  and will remove the method later once other clauses are ported.
    return true;
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
