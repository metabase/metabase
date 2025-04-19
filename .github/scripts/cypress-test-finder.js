#!/usr/bin/env node

/* eslint-disable no-console */
/* eslint-disable import/no-commonjs */
/* global process */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse");

/**
 * Parses git diff output to extract file paths and changed lines
 *
 * @param {string} diffOutput - The output from git diff command
 * @returns {Object[]} - Array of objects with filePath and changedLines
 */
function parseDiff(diffOutput) {
  const lines = diffOutput.split("\n");
  const changedFiles = [];

  let currentFile = null;
  let lineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file
    if (line.startsWith("diff --git")) {
      const filePath = line.split(" ")[2].substring(2); // Remove "b/" prefix

      // Only process Cypress spec files
      if (
        filePath.endsWith(".spec.js") ||
        filePath.endsWith(".cy.spec.js") ||
        filePath.endsWith(".spec.ts") ||
        filePath.endsWith(".cy.spec.ts")
      ) {
        currentFile = {
          filePath,
          changedLines: [],
        };
        changedFiles.push(currentFile);
      } else {
        currentFile = null;
      }
    }

    // New hunk
    if (currentFile && line.startsWith("@@")) {
      // Extract line numbers: @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        lineNumber = parseInt(match[1], 10);
      }
    }

    // Added or modified lines
    if (currentFile && line.startsWith("+") && !line.startsWith("+++")) {
      currentFile.changedLines.push(lineNumber);
      lineNumber++;
    }
    // Context and unmodified lines
    else if (
      currentFile &&
      !line.startsWith("-") &&
      !line.startsWith("---") &&
      !line.startsWith("@@") &&
      !line.startsWith("diff") &&
      !line.startsWith("index")
    ) {
      lineNumber++;
    }
  }

  return changedFiles;
}

/**
 * Finds affected test blocks in a file based on changed lines
 *
 * @param {string} filePath - Path to the spec file
 * @param {number[]} changedLines - Array of line numbers that were changed
 * @returns {Object[]} - Array of affected test blocks
 */
function findAffectedTests(filePath, changedLines) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Parse the file into an AST
  const ast = parse(fileContent, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const affectedTests = [];

  // Traverse the AST to find it blocks
  traverse(ast, {
    CallExpression(path) {
      // Only process it blocks
      if (
        path.node.callee.type === "Identifier" &&
        path.node.callee.name === "it"
      ) {
        // Get the test name (first argument to it)
        const testNameNode = path.node.arguments[0];
        if (testNameNode && testNameNode.type === "StringLiteral") {
          const testName = testNameNode.value;

          // Get the function body (second argument to it)
          const callbackNode = path.node.arguments[1];
          if (
            (callbackNode && callbackNode.type === "FunctionExpression") ||
            callbackNode.type === "ArrowFunctionExpression"
          ) {
            const blockStart = path.node.loc.start.line;
            const blockEnd = path.node.loc.end.line;

            // Check if any changed line is within this test block
            const isAffected = changedLines.some(
              (line) => line >= blockStart && line <= blockEnd,
            );

            if (isAffected) {
              affectedTests.push({
                name: testName,
                file: filePath,
              });
            }
          }
        }
      }
    },
  });

  return affectedTests;
}

/**
 * Generates GitHub CLI command to trigger the workflow
 *
 * @param {string} specPath - Path to the spec file
 * @param {string} testName - Name of the test to run
 * @param {number} burnIn - Number of times to run the test
 * @param {string} ref - Git reference to use for the workflow
 * @returns {string} - GitHub CLI command
 */
function generateWorkflowCommand(specPath, testName, burnIn = 20, ref = null) {
  const refParam = ref ? `--ref ${ref}` : `--ref $(git branch --show-current)`;

  return `gh workflow run e2e-stress-test-flake-fix.yml \
  ${refParam} \
  --field spec=${specPath} \
  --field burn_in=${burnIn} \
  --field grep="${testName}"`;
}

function main() {
  try {
    const args = process.argv.slice(2);

    // Get burn-in count
    const burnIn = args.find((arg) => arg.startsWith("--burn="))
      ? args.find((arg) => arg.startsWith("--burn=")).split("=")[1]
      : 20;

    // Check if we should execute the workflows
    const shouldExecute = args.includes("--execute");

    // Get base branch for comparison (default: master)
    const baseBranchArg = args.find((arg) => arg.startsWith("--base="));
    const baseBranch = baseBranchArg ? baseBranchArg.split("=")[1] : "master";

    // Get git ref for workflow execution
    const refArg = args.find((arg) => arg.startsWith("--ref="));
    const ref = refArg ? refArg.split("=")[1] : null;

    console.log(`Comparing changes against base branch: ${baseBranch}`);
    if (ref) {
      console.log(`Using head ref for workflows: ${ref}`);
    }

    const diffOutput = execSync(`git diff ${baseBranch}...HEAD`).toString();
    const changedFiles = parseDiff(diffOutput);

    if (changedFiles.length === 0) {
      console.log("No Cypress spec files changed");
      return;
    }

    let allAffectedTests = [];

    for (const file of changedFiles) {
      const tests = findAffectedTests(file.filePath, file.changedLines);
      allAffectedTests = allAffectedTests.concat(tests);
    }

    if (allAffectedTests.length === 0) {
      console.log("No affected tests found");
    } else {
      console.log(`Found ${allAffectedTests.length} affected tests\n`);

      allAffectedTests.forEach((test) => {
        const relativePath = path.relative(process.cwd(), test.file);
        console.log(`Test: ${relativePath}: "${test.name}"`);

        const command = generateWorkflowCommand(
          relativePath,
          test.name,
          burnIn,
          ref,
        );
        console.log(command);

        if (shouldExecute) {
          console.log(`\nExecuting workflow for "${test.name}"...`);
          try {
            execSync(command, { stdio: "inherit" });
            console.log("Workflow triggered successfully!\n");
          } catch (error) {
            console.error(`Failed to trigger workflow: ${error.message}\n`);
          }
        }

        console.log(""); // Empty line for separation
      });

      if (!shouldExecute) {
        console.log("\nTo trigger workflows, run with --execute flag:");
        console.log(
          "node cypress-test-finder.js --execute --burn=20 --base=main --ref=feature-branch",
        );
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
