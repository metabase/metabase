import { createMockColumn } from "metabase-types/api/mocks";

export function makeData(cols, rows) {
  return {
    cols,
    rows,
  };
}

export const Column = (col = {}) =>
  createMockColumn({
    ...col,
    name: col.name || "column_name",
    display_name: col.display_name || col.name || "column_display_name",
  });

export const DateTimeColumn = (col = {}) =>
  Column({ base_type: "type/DateTime", semantic_type: null, ...col });
export const NumberColumn = (col = {}) =>
  Column({ base_type: "type/Integer", semantic_type: "type/Number", ...col });
export const StringColumn = (col = {}) =>
  Column({ base_type: "type/Text", semantic_type: null, ...col });

export const Card = (name, ...overrides) =>
  deepExtend(
    {
      card: {
        name: name + "_name",
        visualization_settings: {},
      },
    },
    ...overrides,
  );

export const ScalarCard = (name, ...overrides) =>
  Card(
    name,
    {
      card: {
        display: "scalar",
      },
      data: {
        cols: [NumberColumn({ name: name + "_col0" })],
        rows: [[1]],
      },
    },
    ...overrides,
  );

function deepExtend(target, ...sources) {
  for (const source of sources) {
    for (const prop in source) {
      if (Object.prototype.hasOwnProperty.call(source, prop)) {
        if (
          target[prop] &&
          typeof target[prop] === "object" &&
          source[prop] &&
          typeof source[prop] === "object"
        ) {
          deepExtend(target[prop], source[prop]);
        } else {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target;
}
