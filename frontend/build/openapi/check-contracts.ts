/* eslint-disable no-console -- CLI diagnostics and coverage report */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import ts from "typescript";

import { baselineProblems, checkContracts } from "./contracts";

const root = process.cwd();
const baselinePath = resolve(root, "frontend/build/openapi/baseline.json");
const generatedPath = resolve(root, ".tmp/openapi/types/types.gen.d.ts");
const reportPath = resolve(root, ".tmp/openapi/contracts-report.json");

function readBaseline(): Record<string, string> {
  const value: unknown = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Contract baseline must be an object mapping check IDs to mismatch/unverified.",
    );
  }
  const entries = Object.entries(value);
  if (
    entries.some(
      ([, status]) => status !== "mismatch" && status !== "unverified",
    )
  ) {
    throw new Error(
      "Invalid baseline status: expected mismatch or unverified.",
    );
  }
  return Object.fromEntries(entries);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--update-baseline")) {
    throw new Error("Usage: bun run api-contracts:check [--update-baseline]");
  }
  const configPath = resolve(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    throw new Error(
      parsed.errors
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
        .join("\n"),
    );
  }
  const endpointFiles = parsed.fileNames.filter(
    (file) =>
      /\/frontend\/src\//.test(file) &&
      !/\.(?:spec|test)\./.test(file) &&
      /builder\.(?:query|mutation)\b/.test(readFileSync(file, "utf8")),
  );
  const program = ts.createProgram({
    rootNames: [
      ...endpointFiles,
      generatedPath,
      ...parsed.fileNames.filter((file) => file.endsWith(".d.ts")),
    ],
    options: { ...parsed.options, incremental: false, noEmit: true },
  });
  const results = checkContracts(program, endpointFiles, generatedPath, root);
  const counts = { pass: 0, mismatch: 0, unverified: 0, ignored: 0 };
  for (const result of results) {
    counts[result.status] += 1;
  }
  const responseCounts = { pass: 0, mismatch: 0, unverified: 0, ignored: 0 };
  for (const result of results.filter((r) => /:response(?:\.|$)/.test(r.id))) {
    responseCounts[result.status] += 1;
  }
  const endpointCount = new Set(
    results.map((r) => r.id.slice(0, r.id.lastIndexOf(":"))),
  ).size;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({ endpointCount, counts, responseCounts, results }, null, 2)}\n`,
  );
  if (args.includes("--update-baseline")) {
    const exemptions = results.filter(
      (r) => r.status === "mismatch" || r.status === "unverified",
    );
    writeFileSync(
      baselinePath,
      `${JSON.stringify(Object.fromEntries(exemptions.map((r) => [r.id, r.status])), null, 2)}\n`,
    );
    console.log(
      `Updated ${exemptions.length} exemptions. Review the baseline diff before committing.`,
    );
  } else {
    const problems = baselineProblems(results, readBaseline());
    if (problems.length) {
      console.error(problems.join("\n\n"));
      process.exitCode = 1;
    }
  }
  console.log(
    `API contracts: ${counts.pass} compatible, ${counts.mismatch} mismatched, ${counts.unverified} unverified, ${counts.ignored} intentionally ignored.`,
  );
  console.log(
    `Response contracts: ${responseCounts.pass} compatible, ${responseCounts.mismatch} mismatched, ${responseCounts.unverified} unverified, ${responseCounts.ignored} intentionally ignored (${endpointCount} endpoints discovered).`,
  );
  console.log(`Details: ${reportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
