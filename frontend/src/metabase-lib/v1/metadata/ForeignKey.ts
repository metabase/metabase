import type { NormalizedForeignKey } from "metabase-types/api";

import type Field from "./Field";
import type Metadata from "./Metadata";

interface ForeignKey
  extends Omit<NormalizedForeignKey, "origin" | "destination"> {
  origin?: Field;
  destination?: Field;
  metadata?: Metadata;
}

/**
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
class ForeignKey {
  private readonly _plainObject: NormalizedForeignKey;

  constructor(foreignKey: NormalizedForeignKey) {
    this._plainObject = foreignKey;
    Object.assign(this, foreignKey);
  }
}

// eslint-disable-next-line import/no-default-export
export default ForeignKey;
