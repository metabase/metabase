// This runs in the Nashorn JavaScript engine and there are some limitations
//
// 1. This is not currently automatically built with the rest of the application, please run `bun run build-shared` after modifying
// 2. Avoid including unnecessary libraries as the JS engine takes a long time to parse and execute them
// 3. Related to #2, we aren't currently including `core-js` so don't use features that require it, e.x. iterables / for-of

import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";

global.console = {
  log: print,
  warn: print,
  error: print,
};

function buildGetter(rowsJSON, colsJSON, settingsJSON) {
  const rows = JSON.parse(rowsJSON);
  const cols = JSON.parse(colsJSON);
  const settings = settingsJSON ? JSON.parse(settingsJSON) : {};
  try {
    return makeCellBackgroundGetter(
      rows,
      cols,
      settings?.["table.column_formatting"] ?? [],
      settings?.["table.pivot"],
    );
  } catch (e) {
    print("ERROR", e);
    return () => null;
  }
}

// Colors many cells in one host call, so the JVM side never holds a context-bound function value
// across a render. `cellsJSON` is an array of [value, rowIndex, colName] triples; returns a JSON
// array of color strings (or null), positionally.
global.getCellBackgroundColors = function (
  rowsJSON,
  colsJSON,
  settingsJSON,
  cellsJSON,
) {
  const getter = buildGetter(rowsJSON, colsJSON, settingsJSON);
  const cells = JSON.parse(cellsJSON);
  return JSON.stringify(cells.map((cell) => getter(cell[0], cell[1], cell[2])));
};
