import { t } from "ttag";

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

  sectionsByType() {
    const itemsBySection = {};
    const addItem = item => {
      const field = item.dimension.field();
      for (const [key, { is }] of Object.entries(SECTIONS_BY_TYPE)) {
        if (is(field)) {
          itemsBySection[key] = itemsBySection[key] || [];
          itemsBySection[key].push(item);
          return;
        }
      }
    };

    for (const dimension of this.dimensions) {
      addItem({
        name: dimension.displayName(),
        icon: null,
        dimension: dimension,
      });
    }
    for (const fk of this.fks) {
      const fkName = stripId(fk.field.display_name);
      for (const dimension of fk.dimensions) {
        addItem({
          name: fkName + " — " + dimension.displayName(),
          icon: null,
          dimension: dimension,
        });
      }
    }

    return SECTIONS_BY_TYPE_DISPLAY_ORDER.filter(
      key => itemsBySection[key],
    ).map(key => ({
      name: SECTIONS_BY_TYPE[key].name,
      icon: SECTIONS_BY_TYPE[key].icon,
      items: itemsBySection[key],
    }));
  }
}

// this is the actual order we should display the sections in
const SECTIONS_BY_TYPE_DISPLAY_ORDER = [
  "date",
  "location",
  "boolean",
  "category",
  "number",
  "text",
  "connection",
  "other",
];

// these are ordered by priority of categorizing fields
// e.x. if a field is a fk it should be considered a "connection" even if it is also a "number" or "text" because it comes first
const SECTIONS_BY_TYPE = {
  connection: {
    name: t`Connection`,
    icon: "connections",
    is: f => f.isFK(),
  },
  date: {
    name: t`Date`,
    icon: "calendar",
    is: f => f.isDate() || f.isTime(),
  },
  location: {
    name: t`Location`,
    icon: "location",
    is: f => f.isLocation() || f.isCoordinate(),
  },
  boolean: {
    name: t`Boolean`,
    icon: "io",
    is: f => f.isBoolean(),
  },
  category: {
    name: t`Category`,
    is: f => f.isCategory(),
  },
  number: {
    name: t`Number`,
    icon: "int",
    is: f => f.isNumber(),
  },
  text: {
    name: t`Text`,
    icon: "string",
    is: f => f => f.isString(),
  },
  other: {
    name: t`Other`,
    icon: "unknown",
    is: f => true,
  },
};
