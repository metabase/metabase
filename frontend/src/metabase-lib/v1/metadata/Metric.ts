import type { NormalizedMetric } from "metabase-types/api";

import type Metadata from "./Metadata";

interface Metric extends Omit<NormalizedMetric, "collection"> {
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class Metric {
  private readonly _plainObject: NormalizedMetric;

  constructor(metric: NormalizedMetric) {
    this._plainObject = metric;
    Object.assign(this, metric);
  }

  getPlainObject() {
    return this._plainObject;
  }

  displayName() {
    return this.name;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Metric;
