#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const prettier = require("prettier");
const flowRemoveTypes = require("flow-remove-types");
const { convert } = require("@khanacademy/flow-to-ts/dist/convert.bundle");

const targetBySourceExtension = {
  ".js": ".ts",
  ".jsx": ".tsx",
};

function convertToTypescript(filename) {
  const content = fs.readFileSync(filename, "utf-8");
  const typescriptCode = convert(content, {
    semi: true,
    prettier: true,
    inlineUtilityTypes: true,
  });

  const sourceExtension = path.extname(filename);
  const targetExtension = typescriptCode.includes("import React")
    ? ".tsx"
    : targetBySourceExtension[path.extname(filename)];

  const targetPath = filename.replace(sourceExtension, targetExtension);

  fs.writeFileSync(targetPath, `// @ts-nocheck\n${typescriptCode}`);
  fs.unlinkSync(filename);
}

function removeFlowTypes(filename) {
  const content = fs.readFileSync(filename, "utf-8");
  const noFlowContent = flowRemoveTypes(content, {
    pretty: true,
    all: true,
  }).toString();
  let formattedContent = prettier.format(noFlowContent.toString(), {
    trailingComma: "all",
    parser: "babel",
  });

  if (content.length === formattedContent.length) {
    return;
  }

  const hadPropFlowTypes = content.search(/(Props|props: {)/) > 0;
  const containsDisablePropTypes = content.includes(
    "eslint-disable react/prop-types",
  );

  if (hadPropFlowTypes && !containsDisablePropTypes) {
    formattedContent = `/* eslint-disable react/prop-types */\n${formattedContent}`;
  }

  fs.writeFileSync(filename, formattedContent);
}

const convertFilesToTypescript = () => {
  const files = [
    ...glob.sync("enterprise/frontend/src/**/*.{js,jsx}"),
    ...glob.sync(
      "frontend/src/{metabase-lib,metabase,metabase-types}/**/*.{js,jsx}",
    ),
  ];

  console.log(`Converting ${files.length} files to Typescript.`);

  files.forEach(file => {
    try {
      convertToTypescript(file);
    } catch (e) {
      console.log(
        `Could not convert ${file} to Typescript, removing flow types`,
      );
      removeFlowTypes(file);
    }
  });
};

const unflowFiles = () => {
  const files = glob.sync("{enterprise/,}frontend/src/**/*.{js,jsx}", {
    ignore: [
      "frontend/src/cljs/**/*.js",
      "frontend/src/{metabase-shared,metabase-types,metabase-lib,cljs}/**/*.js",
    ],
  });

  console.log(`Removing flow from ${files.length} files.`);

  files.forEach(removeFlowTypes);
};

const main = () => {
  convertFilesToTypescript();
  unflowFiles();
};

main();
