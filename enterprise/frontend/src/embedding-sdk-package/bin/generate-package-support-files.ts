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

module.exports = require("./main.bundle");
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
