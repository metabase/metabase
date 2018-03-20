export function makeCard(card) {
  return {
    name: "card",
    dataset_query: {},
    visualization_settings: {},
    display: "scalar",
    ...card,
  };
}

export function makeData(cols, rows) {
  return {
    cols,
    rows,
  };
}

export const Column = (col = {}) => ({
  ...col,
  name: col.name || "column_name",
  display_name: col.display_name || col.name || "column_display_name",
});

export const DateTimeColumn = (col = {}) =>
  Column({ base_type: "type/DateTime", special_type: null, ...col });
export const NumberColumn = (col = {}) =>
  Column({ base_type: "type/Integer", special_type: "type/Number", ...col });
export const StringColumn = (col = {}) =>
  Column({ base_type: "type/Text", special_type: null, ...col });

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

export const TableCard = (name, ...overrides) =>
  Card(
    name,
    {
      card: {
        display: "table",
      },
      data: {
        cols: [NumberColumn({ name: name + "_col0" })],
        columns: ["id"],
        rows: [[1]],
      },
    },
    ...overrides,
  );

export const TextCard = (name, ...overrides) =>
  Card(
    name,
    {
      card: {
        display: "text",
        visualization_settings: {
          text: "",
        },
      },
      data: {
        cols: [],
        columns: [],
        rows: [],
      },
    },
    ...overrides,
  );

export const LineCard = (name, ...overrides) =>
  Card(
    name,
    {
      card: {
        display: "line",
      },
      data: {
        cols: [
          StringColumn({ name: name + "_col0" }),
          NumberColumn({ name: name + "_col1" }),
        ],
        rows: [["a", 0], ["b", 1]],
      },
    },
    ...overrides,
  );

export const MultiseriesLineCard = (name, ...overrides) =>
  Card(
    name,
    {
      card: {
        name: name + "_name",
        display: "line",
        visualization_settings: {},
      },
      data: {
        cols: [
          StringColumn({ name: name + "_col0" }),
          StringColumn({ name: name + "_col1" }),
          NumberColumn({ name: name + "_col2" }),
        ],
        rows: [
          [name + "_cat1", "x", 0],
          [name + "_cat1", "y", 1],
          [name + "_cat1", "z", 1],
          [name + "_cat2", "x", 2],
          [name + "_cat2", "y", 3],
          [name + "_cat2", "z", 4],
        ],
      },
    },
    ...overrides,
  );

function deepExtend(target, ...sources) {
  for (const source of sources) {
    for (const prop in source) {
      if (source.hasOwnProperty(prop)) {
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

export function dispatchUIEvent(element, eventName) {
  let e = document.createEvent("UIEvents");
  e.initUIEvent(eventName, true, true, window, 1);
  element.dispatchEvent(e);
}
