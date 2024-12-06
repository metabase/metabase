import fs from "fs";

import { semanticColors } from "./palette";

// TODO: run this with a pre-commit hook for any changes to palette.ts

const cssColors = `
/* DO NOT EDIT THIS FILE MANUALLY
 *
 * This file is automatically generated from the colors defined
 * in lib/colors/palette.ts
 *
 */

:root {
  ${Object.entries(semanticColors)
    .map(([name, value]) => {
      return `--mb-color-${name}: ${value};`;
    })
    .join("\n  ")}
}
`;

fs.writeFileSync(
  process.cwd() + "/frontend/src/metabase/css/core/palette.module.css",
  cssColors,
);
