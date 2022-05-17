import Dimension from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";

type Option = {
  dimension: Dimension;
};

type Section = {
  name: string;
  icon: string;
  items: Option[];
};

interface IDimensionFK {
  name?: string;
  icon?: string;
  field: Field;
  dimensions: Dimension[];
}

interface IDimensionOptionsProps {
  name: string;
  icon: string;
  count: number;
  dimensions: Dimension[];
  fks: IDimensionFK[];
}

interface IDimensionOptions {
  all(): Dimension[];
  hasDimension(dimension: Dimension): boolean;
  sections(options?: { extraItems?: Option[] }): Section[];
}

export default class DimensionOptions implements IDimensionOptions {
  name: string;
  icon: string;
  count: number = 0;
  dimensions: Dimension[] = [];
  fks: IDimensionFK[] = [];

  constructor({ name, icon, count, dimensions, fks }: IDimensionOptionsProps) {
    this.name = name;
    this.icon = icon;
    this.count = count;
    this.dimensions = dimensions;
    this.fks = fks;
  }

  all(): Dimension[] {
    const dimensions = this.dimensions;
    const fksDimensions = this.fks.map(fk => fk.dimensions).flat();
    return [...dimensions, ...fksDimensions];
  }

  hasDimension(dimension: Dimension): boolean {
    if (!dimension) {
      console.error(
        "attempted to call FieldDimension.hasDimension() with null dimension",
        dimension,
      );
      return false;
    }

    for (const d of this.all()) {
      if (dimension.isSameBaseDimension(d)) {
        return true;
      }
    }

    return false;
  }

  sections({ extraItems = [] } = {}): Section[] {
    const [dimension] = this.dimensions;
    const table = dimension && dimension.field().table;
    const tableName =
      table && !table.isSavedQuestion() ? table.objectName() : null;
    const mainSection: Section = {
      name: this.name || tableName || "Table 2",
      icon: this.icon || "table2",
      items: [
        ...extraItems,
        ...this.dimensions.map(dimension => ({
          dimension,
        })),
      ],
    };

    const fkSections = this.fks.map(fk => ({
      name: fk.name || (fk.field && fk.field.targetObjectName()),
      icon: fk.icon || "connections",
      items: fk.dimensions.map(dimension => ({
        dimension,
      })),
    }));

    const sections = [];
    if (mainSection.items.length > 0) {
      sections.push(mainSection);
    }
    sections.push(...fkSections);

    return sections;
  }
}
