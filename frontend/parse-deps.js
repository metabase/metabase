#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const glob = require("glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const PATTERN = "{enterprise/,}frontend/src/**/*.{js,jsx}";

// after webpack.config.js
const ALIAS = {
  metabase: "frontend/src/metabase",
  "metabase-lib": "frontend/src/metabase-lib",
  "metabase-enterprise": "enterprise/frontend/src/metabase-enterprise",
  "metabase-types": "frontend/src/metabase-types",
};

const files = glob.sync(PATTERN);

const deps = files.map(fileName => {
  const contents = fs.readFileSync(fileName, "utf-8");
  const options = {
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    decoratorsBeforeExport: true,
    sourceType: "unambiguous",
    plugins: ["jsx", "flow", "decorators-legacy", "exportDefaultFrom"],
  };
  const importList = [];
  try {
    const ast = parser.parse(contents, options);
    traverse(ast, {
      enter(path) {
        if (path.node.type === "ImportDeclaration") {
          importList.push(path.node.source.value);
        }
      },
    });
  } catch (e) {
    console.error(fileName, e.toString());
  }
  const base = path.dirname(fileName) + path.sep;
  const absoluteImportList = importList
    .map(name => {
      const absName = name[0] === "." ? path.normalize(base + name) : name;
      const parts = absName.split(path.sep);
      const realPath = ALIAS[parts[0]];
      parts[0] = realPath ? realPath : parts[0];
      const realName = parts.join(path.sep);
      return realName;
    })
    .filter(name => name.indexOf("frontend") === 0);

  const source = path.format({
    ...path.parse(fileName),
    ext: null,
    base: null,
  });
  const dependencies = absoluteImportList.sort();

  return { source, dependencies };
});

let dependents = {};
deps.forEach(dep => {
  const { source, dependencies } = dep;
  dependencies.forEach(d => {
    if (!dependents[d]) {
      dependents[d] = [];
    }
    dependents[d].push(source);
  });
});

console.log(JSON.stringify(dependents, null, 2));
