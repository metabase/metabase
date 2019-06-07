import Dimension from "metabase-lib/lib/Dimension";
import { stripId, singularize } from "metabase/lib/formatting";

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

  sections({ extraItems = [] } = {}) {
    const table = this.dimensions[0] && this.dimensions[0].field().table;
    const mainSection = {
      name: this.name || (table && singularize(table.display_name)),
      icon: this.icon || "table2",
      items: [
        ...extraItems,
        ...this.dimensions.map(dimension => ({ dimension })),
      ],
    };

    const fkSections = this.fks.map(fk => ({
      name: fk.name || stripId(fk.field.display_name),
      icon: fk.icon || "connections",
      items: fk.dimensions.map(dimension => ({ dimension })),
    }));

    const sections = [];
    if (mainSection.items.length > 0) {
      sections.push(mainSection);
    }
    sections.push(...fkSections);

    return sections;
  }
}
