/* @flow */

import MBQLClause from "./MBQLClause";

import type { Breakout as BreakoutObject } from "metabase/meta/types/Query";
import type StructuredQuery from "../StructuredQuery";
import type Dimension from "../../Dimension";

export default class Breakout extends MBQLClause {
  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(breakout: Breakout | BreakoutObject): StructuredQuery {
    return this._query.updateBreakout(this._index, breakout);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeBreakout(this._index);
  }

  dimension(): Dimension {
    return this._query.parseFieldReference(this);
  }

  displayName(): ?string {
    const dimension = this.dimension();
    return dimension && dimension.displayName();
  }
}
