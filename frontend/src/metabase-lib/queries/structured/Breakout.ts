// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type { Breakout as BreakoutObject } from "metabase-types/api";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Dimension from "metabase-lib/Dimension";
import Field from "metabase-lib/metadata/Field";
import MBQLClause from "./MBQLClause";
export default class Breakout extends MBQLClause {
  /**
   * Replaces the breakout in the parent query and returns the new StructuredQuery
   * or replaces itself in the parent query if no {breakout} argument is provided.
   */
  replace(breakout?: Breakout | BreakoutObject): StructuredQuery {
    if (breakout != null) {
      return this._query.updateBreakout(this._index, breakout);
    } else {
      return this._query.updateBreakout(this._index, this);
    }
  }

  /**
   * Adds itself to the parent query and returns the new StructuredQuery
   */
  add(): StructuredQuery {
    return this._query.breakout(this);
  }

  /**
   * Removes the breakout in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeBreakout(this._index);
  }

  /**
   * Returns the display name for the breakout
   */
  displayName(): string | null | undefined {
    const dimension = this.dimension();
    return dimension && dimension.render();
  }

  /**
   * Predicate function to test if a given breakout clause is valid
   */
  isValid() {
    const query = this.query();

    if (!query) {
      return true;
    }

    const dimension = this.getMLv1CompatibleDimension();
    return query.breakoutOptions(this).hasDimension(dimension);
  }

  /**
   * Returns the breakout's Dimension
   */
  dimension(): Dimension {
    return this._query.parseFieldReference(this);
  }

  private getMLv1CompatibleDimension() {
    const dimension = this.dimension();
    const field = dimension.field();
    const isConcreteField = typeof field?.id === "number";
    return isConcreteField
      ? dimension.withoutOptions("base-type", "effective-type")
      : dimension;
  }

  /**
   * Returns the breakout's Field
   */
  field(): Field {
    return this.dimension().field();
  }
}
