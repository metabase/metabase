import Dimension from "metabase-lib/lib/Dimension";

import type Field from "metabase-lib/lib/metadata/Field";

type Option = {
  dimension: Dimension,
};

type Section = {
  name: string,
  icon: string,
  items: Option[],
};

export default class DimensionOptions {
  count: number = 0;
  dimensions: Dimension[] = [];
  fks: Array<{
    field: Field,
    dimensions: Dimension[],
  }> = [];

  constructor(o) {
    Object.assign(this, o);
  }

  all(): Dimension {
    return [].concat(this.dimensions, ...this.fks.map(fk => fk.dimensions));
  }

  hasDimension(dimension: Dimension): boolean {
    for (const d of this.all()) {
      if (dimension.isSameBaseDimension(d)) {
        return true;
      }
    }
    return false;
  }

  sections({ extraItems = [] } = {}): Section[] {
    const table = this.dimensions[0] && this.dimensions[0].field().table;
    const mainSection = {
      name: this.name || (table && table.objectName()),
      icon: this.icon || "table2",
      items: [
        ...extraItems,
        ...this.dimensions.map(dimension => ({ dimension })),
      ],
    };

    const fkSections = this.fks.map(fk => ({
      name: fk.name || (fk.field && fk.field.targetObjectName()),
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
