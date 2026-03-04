import type { NormalizedMeasure } from "metabase-types/api";

import type Metadata from "./Metadata";
import type Table from "./Table";

interface Measure extends Omit<NormalizedMeasure, "table"> {
  table?: Table;
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Measure {
  private readonly _plainObject: NormalizedMeasure;

  constructor(measure: NormalizedMeasure) {
    this._plainObject = measure;
    Object.assign(this, measure);
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }

  isActive() {
    return !this.archived;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Measure;
