import type { Filter, NormalizedSegment } from "metabase-types/api";

import type Metadata from "./Metadata";
import type Table from "./Table";

interface Segment extends Omit<NormalizedSegment, "table"> {
  table?: Table;
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Segment {
  private readonly _plainObject: NormalizedSegment;

  constructor(segment: NormalizedSegment) {
    this._plainObject = segment;
    Object.assign(this, segment);
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }

  filterClause(): Filter {
    return ["segment", this.id];
  }

  isActive() {
    return !this.archived;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Segment;
