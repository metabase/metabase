/* eslint-disable no-console */
import fs from "fs";

import path from "path";
import prettier from "prettier";
import { match } from "ts-pattern";

type ComponentDefinition = {
  mainComponent: string;
  subComponents: string[];
};

// START OF CONFIGURATION
// Note: this list needs to be updated when new components are added

const COMPONENTS_TO_EXPORT: ComponentDefinition[] = [
  // MetabaseProvider is added manually because it needs to render children while loading
  // we may have other components that need to render children while loading, in that case we can add a flag here
  // { mainComponent: "MetabaseProvider", subComponents: [] },
  { mainComponent: "StaticQuestion", subComponents: [] },
  {
    mainComponent: "InteractiveQuestion",
    subComponents: [
      "BackButton",
      "FilterBar",
      "Filter",
      "FilterButton",
      "FilterPicker",
      "ResetButton",
      "Title",
      "Summarize",
      "SummarizeButton",
      "Editor",
      "Notebook",
      "NotebookButton",
      "EditorButton",
      "QuestionVisualization",
      "SaveQuestionForm",
      "SaveButton",
      "ChartTypeSelector",
      "EditorViewControl",
      "QuestionSettings",
    ],
  },
  {
    mainComponent: "StaticDashboard",
    subComponents: [],
  },
  { mainComponent: "InteractiveDashboard", subComponents: [] },
];

// END OF CONFIGURATION

// eslint-disable-next-line no-literal-metabase-strings -- it's code
const MetabaseProviderCode = `
const MetabaseProvider = ({
  config,
  children,
}) => {
  const Provider = dynamic(
    () =>
      import("@metabase/embedding-sdk-react").then((m) => {
        return { default: m.MetabaseProvider };
      }),
    {
      ssr: false,
      loading: () => {
        return React.createElement("div", { id: "metabase-sdk-root" }, children);
      },
    }
  );

  return React.createElement(Provider, { config }, children);
};
`;

const destinationDir = path.resolve(
  __dirname,
  "../../../../../resources/embedding-sdk/dist",
);

const writeToFile = async (filePath: string, content: string) => {
  const fullPath = path.resolve(destinationDir, filePath);
  fs.mkdirSync(destinationDir, { recursive: true });
  // formatting the content with prettier also has the benefit that if the
  // generated code is outright wrong it will fail
  const formattedContent = await formatContent(content);
  fs.writeFileSync(fullPath, formattedContent);
  console.log(`wrote ${fullPath}`);
};

const formatContent = async (content: string) => {
  const prettierConfig = await prettier.resolveConfig(__dirname);
  return prettier.format(content, {
    ...prettierConfig,
    parser: "babel",
  });
};

const generateCodeFor = ({
  component,
  type,
}: {
  component: ComponentDefinition;
  type: "cjs" | "js";
}) => {
  const { mainComponent, subComponents } = component;

  return `
// === ${mainComponent} ===

const ${mainComponent} = dynamic(
  () =>
    import("./main.bundle.js").then((m) => {
      return { default: m.${mainComponent} };
    }),
  { ssr: false, loading: () => "Loading..." }
);

${subComponents
  .map(
    subComponent => `${mainComponent}.${subComponent} = dynamic(
() =>
  import("./main.bundle.js").then((m) => {
    return { default: m.${mainComponent}.${subComponent} };
    }),
  { ssr: false, loading: () => "Loading..." }
);`,
  )
  .join("\n\n")}

${match(type)
  .with("cjs", () => `module.exports.${mainComponent} = ${mainComponent};`)
  .with("js", () => `export {${mainComponent}};`)
  .exhaustive()}
`;
};

const generateAllComponents = (type: "cjs" | "js") => {
  return COMPONENTS_TO_EXPORT.map(component =>
    generateCodeFor({ component, type }),
  ).join("\n");
};

// next uses either cjs or esm, it uses cjs for when running on the server on pages router

// nextjs.{cjs,js} => "index file" that re-exports the helpers and the components
// nextjs-no-ssr.{cjs,js} => file marked as "use client" that re-exports the components wrapped in dynamic import with no ssr

// we need to re-export these helpers so they can be used without importing the entire bundle, that will make next crash because window is undefined
const defineEmbeddingSdkConfig = "config => config";
const defineEmbeddingSdkTheme = "theme => theme";

const nextjs_cjs = `
module.exports.defineEmbeddingSdkConfig = ${defineEmbeddingSdkConfig};
module.exports.defineEmbeddingSdkTheme = ${defineEmbeddingSdkTheme};

module.exports = { ...module.exports, ...require("./nextjs-no-ssr.cjs") };
`;

const nextjs_js = `
export const defineEmbeddingSdkConfig = ${defineEmbeddingSdkConfig};
export const defineEmbeddingSdkTheme = ${defineEmbeddingSdkTheme};

export * from "./nextjs-no-ssr.js";
`;

// eslint-disable-next-line no-literal-metabase-strings -- it's code
const nextjs_no_ssr_cjs = `"use client";

const React = require("react");

const dynamic = require("next/dynamic").default;

${MetabaseProviderCode}
module.exports.MetabaseProvider = MetabaseProvider;


${generateAllComponents("cjs")}
`;

// eslint-disable-next-line no-literal-metabase-strings -- it's code
const nextjs_no_ssr_js = `"use client";

import dynamic from "next/dynamic";

const React = require("react");

${MetabaseProviderCode}
export { MetabaseProvider };

${generateAllComponents("js")}
`;

writeToFile("nextjs.cjs", nextjs_cjs);
writeToFile("nextjs.js", nextjs_js);

writeToFile("nextjs-no-ssr.cjs", nextjs_no_ssr_cjs);
writeToFile("nextjs-no-ssr.js", nextjs_no_ssr_js);

writeToFile(
  "nextjs.d.ts",
  `export * from "./enterprise/frontend/src/embedding-sdk/index.d.ts";`,
);
