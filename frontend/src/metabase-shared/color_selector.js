// This runs in the Nashorn JavaScript engine and there are some limitations
//
// 1. This is not currently automatically built with the rest of the application, please run `yarn build-shared` after modifying
// 2. Avoid including unecessary libraries as the JS engine takes a long time to parse and execute them
// 3. Related to #2, we aren't currently including `core-js` so don't use features that require it, e.x. iterables / for-of

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
    return makeCellBackgroundGetter(rows, cols, settings);
  } catch (e) {
    print("ERROR", e);
    return () => null;
  }
};
