import Dimension from "metabase-lib/lib/Dimension";

export default class DimensionOptions {
  count: number;
  dimensions: Dimension[];
  fks: Array<{
    field: FieldMetadata,
    dimensions: Dimension[],
  }>;

  constructor(o) {
    Object.assign(this, o);
  }

  allDimensions() {
    return [].concat(this.dimensions, ...this.fks.map(fk => fk.dimensions));
  }

  hasDimension(dimension: Dimension): boolean {
    for (const d of this.allDimensions()) {
      if (dimension.isSameBaseDimension(d)) {
        return true;
      }
    }
    return false;
  }
}
