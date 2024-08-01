#!/usr/bin/env node
const fs = require("fs").promises;

const chalk = require("chalk");
const glob = require("glob");
const path = require("path");
const ts = require("typescript");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const E2E_FILE_EXTENSION = /\.cy\.spec\.(js|ts)$/;
const E2E_HOME = "e2e/test";

const E2E_FILE_PATTERN = `${E2E_HOME}/**/*.{js,ts}`;

const E2E_BARREL_FILE_GLOB = `${E2E_HOME}/**/*.ci.cy.spec.{js,ts}`;
const E2E_BARREL_FILE_REGEX = /\.ci\.cy\.spec\.(js|ts)$/;

main().catch(err => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const filesToValidate = await getFilesToValidate(process.argv);

  if (filesToValidate.length === 0) {
    return;
  }

  console.log(`Validating ${filesToValidate.length} E2E files...`);
  const ok = await validate(filesToValidate);

  if (ok) {
    console.log("All is well!");
  } else {
    printHints();
    process.exit(1);
  }
}

/**
 * Determine which files to validate.
 *
 * @returns {string[]}
 */
function getFilesToValidate(argv) {
  const args = argv.slice(2);

  if (args.length === 0) {
    return getAllFiles();
  }

  if (args[0] === "--staged") {
    return getStagedFiles();
  }

  return args;
}

/**
 * Find all relevant files in the e2e/test directory.
 *
 * @returns {string[]}
 */
function getAllFiles() {
  return glob.sync(E2E_FILE_PATTERN).filter(shouldValidateFile);
}

/**
 * Find relevant staged files.
 *
 * @returns {string[]}
 */
async function getStagedFiles() {
  const res = await exec("git diff HEAD --name-only --diff-filter=d", {
    encoding: "utf-8",
  });
  const stagedFiles = res.stdout.split("\n");
  return stagedFiles.filter(shouldValidateFile);
}

/**
 * Returns true if the given filename is a file in the E2E directory that
 * needs to be validated.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function shouldValidateFile(filename) {
  return (
    isInDirectory(E2E_HOME, filename) &&
    !isInDirectory(`${E2E_HOME}/helpers`, filename) &&
    !isInDirectory(`${E2E_HOME}/shared`, filename)
  );
}

/**
 * Returns true if the filename is a (grand)child of the directory.
 *
 * @param {string} directory
 * @param {string} filename
 * @returns {boolean}
 */
function isInDirectory(directory, filename) {
  const rdirectory = path.resolve(directory);
  const rfilename = path.resolve(filename);
  return rfilename.startsWith(rdirectory);
}

/**
 * Validate the specified files and print the feedback.
 *
 * @returns {Promise<boolean>} - true if all files are valid, false otherwise.
 */
async function validate(files) {
  const validations = await Promise.all([
    validateE2EFileNames(files),
    validateSpecsAreImportedInBarrelFile(files),
  ]);
  return validations.every(Boolean);
}

/**
 * Validate the specified files and print feedback.
 *
 * @param {string[]} files
 */
async function validateSpecsAreImportedInBarrelFile(files) {
  const specFilesWithoutImports = await findSpecFilesWithoutImports(files);
  if (specFilesWithoutImports.length === 0) {
    return true;
  }

  error("Found spec files that are not imported in a ci.cy.spec.ts file:");
  error();
  for (const specFile of specFilesWithoutImports) {
    error("  ", specFile);
  }

  return false;
}

/**
 * Find all the barrel files in the E2E directory.
 *
 * @returns {string[]}
 */
function findBarrelFiles() {
  return glob.sync(E2E_BARREL_FILE_GLOB);
}

/**
 * Returns true if the given specifier is a barrel file.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
function isBarrelFile(specifier) {
  return E2E_BARREL_FILE_REGEX.test(specifier);
}

/**
 * Find all the spec files in the E2E directory.
 *
 * @returns {string[]}
 */
function findSpecFiles(files) {
  return files
    .filter(filename => !isBarrelFile(filename))
    .map(filename => filename.replace(/\.(js|ts)$/, ""));
}

/**
 * Find the spec files that are not imported by a ci.cy.spec file.
 *
 * @param {string[]} files
 * @returns {Promise<string[]>}
 */
async function findSpecFilesWithoutImports(files) {
  const tree = await getBarrelImports();
  const specFiles = findSpecFiles(files);

  const specsWithoutImports = specFiles.filter(specFile => !(specFile in tree));
  return specsWithoutImports;
}

/**
 * Find all the barrel files and determines the
 * spec files that are being imported by them.
 *
 * Returns a map of spec file to the barrel file that imports it.
 *
 * @returns {Promise<Record<string, string>>}
 */
async function getBarrelImports() {
  const barrelFiles = findBarrelFiles();
  const res = {};

  const imports = await Promise.all(barrelFiles.map(findImports));
  for (const index in barrelFiles) {
    const barrelFile = barrelFiles[index];
    const found = imports[index];
    for (const filename of found) {
      res[filename] = barrelFile;
    }
  }

  return res;
}

/**
 * Returns true if the given specifier is a relative import.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
function isRelative(specifier) {
  return /^\./.test(specifier);
}

/**
 * Resolves the specified import from the importing filename to the imported filename.
 *
 * @param {string} filename
 * @param {string} specifier
 * @return {string}
 */
function resolveImport(filename, specifier) {
  return path.join(path.dirname(filename), specifier);
}

/**
 * Find all imports in a barrel file that are specs.
 *
 * @param {string} filename
 * @returns {Promise<string[]>}
 */
async function findImports(filename) {
  const content = await fs.readFile(filename, "utf-8");

  const node = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const found = [];

  walk(node, {
    [ts.SyntaxKind.ImportDeclaration]: node => {
      const specifier = node.moduleSpecifier.text;
      if (!specifier) {
        return;
      }
      if (!isRelative(specifier)) {
        return;
      }
      if (node.importClause?.isTypeOnly) {
        return;
      }

      const resolved = resolveImport(filename, specifier);
      found.push(resolved);
    },
  });

  return found;
}

/**
 * @typedef {{[kind: string]: (node: ts.Node) => void}} Visitor
 */

/**
 * Walk a ts.Node and call the visitor function for each node.
 *
 * @param {ts.Node} node
 * @visitor {Visitor} visitor
 */
function walk(node, visitor) {
  if (node.kind in visitor) {
    visitor[node.kind](node);
  }
  for (const child of node.getChildren()) {
    walk(child, visitor);
  }
}

/**
 * Validate the E2E file names and print feedback.
 *
 * @param {string[]} files
 * @returns {boolean} - True if all files are valid, false otherwise.
 */
function validateE2EFileNames(files = []) {
  const invalidFileNames = findInvalidE2EFileNames(files);

  if (invalidFileNames.length === 0) {
    return true;
  }

  error(`Found Cypress files not ending with '${E2E_FILE_EXTENSION}':`);
  error();
  error();
  for (const filename of invalidFileNames) {
    error("  ", filename);
  }

  return false;
}

/**
 * Find all invalid E2E file names.
 *
 * @param {string[]} files
 * @returns {string[]}
 */
function findInvalidE2EFileNames(files = []) {
  return files.filter(filename => !isValidE2EFileName(filename));
}

/**
 * Check if a filename is a valid E2E file name.
 * @param {string}
 * @returns {boolean}
 */
function isValidE2EFileName(filename) {
  return path.basename(filename).match(E2E_FILE_EXTENSION);
}

/**
 * Print an error message to the console.
 * @param {string[]} messages
 */
function error(...messages) {
  console.error(chalk.red(messages.join(" ")));
}

/**
 * Print extra feedback to the console.
 */
function printHints() {
  error(`
• Please make sure E2E specs have the .cy.spec.{js,ts} file extension
• You can place helpers and support files in 'helpers' or 'support' directories
• Please make sure all E2E files are imported in at least one ci.cy.spec.ts file`);
}
