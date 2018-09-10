// This runs in the Nashorn JavaScript engine and there are some limitations
//
// 1. This is not currently automatically built with the rest of the application, please run `yarn build-shared` after modifying
// 2. Avoid including unecessary libraries as the JS engine takes a long time to parse and execute them
// 3. Related to #2, we aren't currently including `babel-polyfill` so don't use features that require it, e.x. iterables / for-of

import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";

global.console = {
  log: print,
  warn: print,
  error: print,
};

global.makeCellBackgroundGetter = function(
  rowsJavaList,
  colsJSON,
  settingsJSON,
) {
  const rows = rowsJavaList;
  const cols = JSON.parse(colsJSON);
  const settings = JSON.parse(settingsJSON);
  try {
    const getter = makeCellBackgroundGetter(rows, cols, settings);
    return (value, rowIndex, colName) => {
      const color = getter(value, rowIndex, colName);
      if (color) {
        return roundColor(color);
      }
      return null;
    };
  } catch (e) {
    print("ERROR", e);
    return () => null;
  }
};

// HACK: d3 may return rgb values with decimals but the rendering engine used for pulses doesn't support that
function roundColor(color) {
  return color.replace(
    /rgba\((\d+(?:\.\d+)),\s*(\d+(?:\.\d+)),\s*(\d+(?:\.\d+)),\s*(\d+\.\d+)\)/,
    (_, r, g, b, a) =>
      `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`,
  );
}
