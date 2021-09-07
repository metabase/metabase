#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const glob = require("glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const readline = require("readline");

const PATTERN = "{enterprise/,}frontend/src/**/*.{js,jsx}";

// after webpack.config.js
const ALIAS = {
  metabase: "frontend/src/metabase",
  "metabase-lib": "frontend/src/metabase-lib",
  "metabase-enterprise": "enterprise/frontend/src/metabase-enterprise",
  "metabase-types": "frontend/src/metabase-types",
};

function files() {
  return glob.sync(PATTERN);
}

function dependencies() {
  const deps = files().map(fileName => {
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
          if (path.node.type === "CallExpression") {
            const callee = path.node.callee;
            const args = path.node.arguments;
            if (callee.type === "Identifier" && callee.name === "require") {
              if (args.length === 1 && args[0].type === "StringLiteral") {
                importList.push(args[0].value);
              }
            }
          }
        },
      });
    } catch (e) {
      console.error(fileName, e.toString());
      process.exit(-1);
      n;
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
  return deps;
}

function dependents() {
  let dependents = {};
  dependencies().forEach(dep => {
    const { source, dependencies } = dep;
    dependencies.forEach(d => {
      if (!dependents[d]) {
        dependents[d] = [];
      }
      dependents[d].push(source);
    });
  });
  return dependents;
}

function filterDependents() {
  const rl = readline.createInterface({
    input: process.stdin,
  });

  const allDependents = dependents();
  const filteredDependents = [];

  const start = async () => {
    for await (const line of rl) {
      const name = line
        .trim()
        .replace(/\.js$/, "")
        .replace(/\.jsx$/, "");
      if (name.length > 0) {
        const list = allDependents[name];
        if (list && Array.isArray(list) && list.length > 0) {
          filteredDependents.push(...list);
        }
      }
    }
    console.log(
      Array.from(new Set(filteredDependents))
        .sort()
        .join("\n"),
    );
  };
  start();
}

const USAGE = `
parse-deps cmd

cmd must be one of:

            files   Display list of source files
     dependencies   Show the dependencies of each source file
       dependents   Show the dependents of each source file
filter-dependents   Filter dependents based on stdin
`;

function main(args) {
  const cmd = args[0];
  if (cmd) {
    switch (cmd.toLowerCase()) {
      case "files":
        console.log(files().join("\n"));
        break;
      case "dependencies":
        console.log(JSON.stringify(dependencies(), null, 2));
        break;
      case "dependents":
        console.log(JSON.stringify(dependents(), null, 2));
        break;
      case "filter-dependents":
        filterDependents();
        break;
      default:
        console.log(USAGE);
        break;
    }
  } else {
    console.log(USAGE);
  }
}

let args = process.argv;
args.shift();
args.shift();
main(args);
