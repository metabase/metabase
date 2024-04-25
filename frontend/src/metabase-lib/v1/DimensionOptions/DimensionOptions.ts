import type Dimension from "metabase-lib/v1/Dimension";

import type {
  DimensionFK,
  DimensionOptionsProps,
  DimensionOptionsSection,
} from "./types";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class DimensionOptions {
  name?: string;
  icon?: string;
  count: number = 0;
  dimensions: Dimension[] = [];
  fks: DimensionFK[] = [];

  constructor(properties?: DimensionOptionsProps) {
    Object.assign(this, properties || {});
  }

  all(): Dimension[] {
    const dimensions = this.dimensions;
    const fksDimensions = this.fks.map(fk => fk.dimensions).flat();
    return [...dimensions, ...fksDimensions];
  }

  hasDimension(dimension: Dimension): boolean {
    // TO BE REMOVED
    if (!dimension) {
      console.error(
        "attempted to call FieldDimension.hasDimension() with null dimension",
        dimension,
      );
      return false;
    }

    return !!this.all().find(dim => dimension.isSameBaseDimension(dim));
  }

  sections({ extraItems = [] } = {}): DimensionOptionsSection[] {
    const dimension =
      this.dimensions.find(dimension => !dimension.isExpression()) ??
      this.dimensions[0];
    const table = dimension && dimension.field().table;
    const tableName = table ? table.objectName() : null;
    const mainSection: DimensionOptionsSection = {
      name: this.name || tableName,
      icon: this.icon || "table",
      items: [
        ...extraItems,
        ...this.dimensions.map(dimension => ({
          dimension,
        })),
      ],
    };

    const sections: DimensionOptionsSection[] = this.fks.map(fk => ({
      name: fk.name || (fk.field && fk.field.targetObjectName()),
      icon: fk.icon || "connections",
      items: fk.dimensions.map(dimension => ({
        dimension,
      })),
    }));

    if (mainSection.items.length > 0) {
      sections.unshift(mainSection);
    }

    return sections;
  }
}
