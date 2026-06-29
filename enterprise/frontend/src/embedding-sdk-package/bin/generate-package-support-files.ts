import fs from "fs";
import path from "path";

import { getPublicComponents } from "embedding-sdk-package/bin/get-public-components";

const destinationDir = path.resolve(
  __dirname,
  "../../../../../resources/embedding-sdk/dist",
);

const writeToFile = async (filePath: string, content: string) => {
  const fullPath = path.resolve(destinationDir, filePath);

  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(fullPath, content);

  console.log(`wrote ${fullPath}`);
};

const nextjs_cjs = `
"use client";

const MetabaseEmbeddingSDK = require("./main.bundle");

module.exports = MetabaseEmbeddingSDK;
`.trim();

const nextjs_js = `
"use client";

export * from "./main.bundle.js";
`.trim();

writeToFile("nextjs.cjs", nextjs_cjs);
writeToFile("nextjs.js", nextjs_js);

// Data-app specific imports
const dataApp_cjs = `
const DataApp = require("./data-app.bundle");

module.exports = DataApp;
`.trim();

const dataApp_js = `
export * from "./data-app.esm.js";
`.trim();

writeToFile("data-app.cjs", dataApp_cjs);
writeToFile("data-app.js", dataApp_js);

// Data-app dev runtime imports
const dataAppDev_cjs = `
const DataAppDev = require("./data-app-dev.bundle");

module.exports = DataAppDev;
`.trim();

const dataAppDev_js = `
export * from "./data-app-dev.esm.js";
`.trim();

writeToFile("data-app-dev.cjs", dataAppDev_cjs);
writeToFile("data-app-dev.js", dataAppDev_js);

// Data-app dev server preset (node) imports
const dataAppDevServer_cjs = `
const DataAppDevServer = require("./data-app-dev-server.bundle");

module.exports = DataAppDevServer;
`.trim();

const dataAppDevServer_js = `
export * from "./data-app-dev-server.esm.js";
`.trim();

writeToFile("data-app-dev-server.cjs", dataAppDevServer_cjs);
writeToFile("data-app-dev-server.js", dataAppDevServer_js);

// Ship the dev entry source verbatim next to the preset bundle; the dev plugin
// reads it at runtime and serves it as a virtual module (it runs in the
// consumer's app, so it isn't compiled here).
const dataAppDevEntry = fs.readFileSync(
  path.resolve(__dirname, "../data-app-dev-server/dev-entry.ts"),
  "utf8",
);
writeToFile("data-app-dev-entry.ts", dataAppDevEntry);

// Development mode entry point.
// When the host app bundler resolves the "development" exports condition,
// this file sets a window global so the SDK bundle can detect dev mode.
const devMode_js = `
try {
  if (typeof window !== "undefined") {
    window.METABASE_EMBEDDING_SDK_IS_HOST_APP_IN_DEV_MODE = true;
  }
} catch (e) {
  console.warn("Metabase SDK: Failed to set dev mode flag", e);
}

export * from "./main.esm.js";
`.trim();

writeToFile("main.development.js", devMode_js);

writeToFile(
  "nextjs.d.ts",
  `
import {
${getPublicComponents()
  .map(({ mainComponent }) => {
    return `${mainComponent} as _${mainComponent},`;
  })
  .join("\n")}
} from './index.d.ts';

export * from "./index.d.ts";

${getPublicComponents()
  .map(({ mainComponent }) => {
    return `
/**
  * @deprecated Next.js compat layer is deprecated and will be removed in a future version.
  * Use the '@metabase/embedding-sdk-react' main entry point instead.
  */
export declare const ${mainComponent} = _${mainComponent};
    `;
  })
  .join("")}
`,
);
