/* eslint-disable no-console */
import fs from "fs";

import path from "path";
import prettier from "prettier";

// we need to re-export these helpers so they can be used without importing the entire bundle, that will make next crash because window is undefined
const defineEmbeddingSdkConfig = "config => config";
const defineEmbeddingSdkTheme = "theme => theme";

const COMPONENTS_TO_EXPORT = [
  // eslint-disable-next-line no-literal-metabase-strings -- cli tool
  "MetabaseProvider",
  "StaticQuestion",
  "InteractiveQuestion",
  "StaticDashboard",
  "InteractiveDashboard",
];

const destinationDir = path.resolve(
  __dirname,
  "../../../../../resources/embedding-sdk/dist",
);

const writeToFile = async (filePath: string, content: string) => {
  const fullPath = path.resolve(destinationDir, filePath);
  fs.mkdirSync(destinationDir, { recursive: true });
  const formattedContent = await formatContent(content);
  fs.writeFileSync(fullPath, formattedContent);
  console.log(`wrote to ${fullPath}`);
};

const formatContent = async (content: string) => {
  const prettierConfig = await prettier.resolveConfig(__dirname);
  return prettier.format(content, {
    ...prettierConfig,
    parser: "babel",
  });
};

// next uses either cjs or esm, depending if using app or pages router, so we need to support both

// next.{cjs,js} => "index file" that re-exports the helpers and the components

// next-no-ssr.{cjs,js} => file marked as "use client" that re-exports the components wrapped in dynamic import with no ssr

const next_cjs = `
console.log("next.cjs");
module.exports.defineEmbeddingSdkConfig = ${defineEmbeddingSdkConfig};
module.exports.defineEmbeddingSdkTheme = ${defineEmbeddingSdkTheme};

module.exports = { ...module.exports, ...require("./next-no-ssr.cjs") };
`;

const next_js = `
console.log("next.js");
export const defineEmbeddingSdkConfig = ${defineEmbeddingSdkConfig};
export const defineEmbeddingSdkTheme = ${defineEmbeddingSdkTheme};

export * from "./next-no-ssr.js";
`;

const next_no_ssr_cjs = `
"use client";
console.log("next-no-ssr.cjs");

const dynamic = require("next/dynamic").default;

${COMPONENTS_TO_EXPORT.map(
  component => `module.exports.${component} = dynamic(() => import("./main.bundle.js").then(m => {
    console.log("${component}", m.${component});
    return { default: m.${component} }
  }), { ssr: false });`,
).join("\n\n")}
`;

const next_no_ssr_js = `
"use client";
console.log("next-no-ssr.js");

import dynamic from "next/dynamic";

${COMPONENTS_TO_EXPORT.map(
  component => `export const ${component} = dynamic(() => import("./main.bundle.js").then(m => {
    console.log("${component}", m.${component});
    return { default: m.${component} }
  }), { ssr: false });`,
).join("\n\n")}
`;

writeToFile("next.cjs", next_cjs);
writeToFile("next.js", next_js);
writeToFile("next-no-ssr.cjs", next_no_ssr_cjs);
writeToFile("next-no-ssr.js", next_no_ssr_js);
