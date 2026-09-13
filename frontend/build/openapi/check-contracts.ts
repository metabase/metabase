/* eslint-disable no-console -- CLI diagnostics and coverage report */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import ts from "typescript";

import { baselineProblems, checkContracts } from "./contracts";

const root = process.cwd();
const baselinePath = resolve(root, "frontend/build/openapi/baseline.json");
const generatedPath = resolve(root, ".tmp/openapi/types/types.gen.d.ts");
const reportPath = resolve(root, ".tmp/openapi/contracts-report.json");

function readBaseline(): string[] {
  const value: unknown = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error(
      "Contract baseline must be an array of non-empty endpoint IDs.",
    );
  }
  return [...new Set(value)];
}

function main(): void {
  const args = process.argv.slice(2);
  const updateBaseline = args.length === 1 && args[0] === "--update-baseline";
  const explain =
    args.length === 2 && args[0] === "--explain" ? args[1] : undefined;
  if (args.length && !updateBaseline && !explain) {
    throw new Error(
      "Usage: bun run api-contract-check-pure [--update-baseline | --explain <endpoint>]",
    );
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
      /\b(?:query|mutation)\b/.test(readFileSync(file, "utf8")),
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
  const endpointCount = new Set(results.map((r) => r.endpointId)).size;
  const failingEndpoints = new Set(
    results
      .filter((r) => r.status === "mismatch" || r.status === "unverified")
      .map((r) => r.endpointId),
  );
  const exemptEndpoints = updateBaseline
    ? [...failingEndpoints].sort()
    : readBaseline();
  const staleExemptions = exemptEndpoints.filter(
    (id) => !failingEndpoints.has(id),
  );
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({ endpointCount, counts, responseCounts, exemptEndpoints, staleExemptions, results }, null, 2)}\n`,
  );
  if (explain) {
    const matching = results.filter((result) => result.id.includes(explain));
    if (!matching.length) {
      throw new Error(`No contract checks match ${JSON.stringify(explain)}.`);
    }
    for (const result of matching) {
      console.log(
        `${result.file}:${result.line} ${result.id}\n  ${result.status}: ${result.message}`,
      );
    }
  }
  if (updateBaseline) {
    writeFileSync(
      baselinePath,
      `${JSON.stringify(exemptEndpoints, null, 2)}\n`,
    );
    console.log(
      `Updated ${exemptEndpoints.length} endpoint exemptions. Review the baseline diff before committing.`,
    );
  } else {
    const problems = baselineProblems(results, exemptEndpoints);
    if (problems.length) {
      console.error(problems.join("\n\n"));
      process.exitCode = 1;
    }
  }
  if (staleExemptions.length) {
    console.log(
      `${staleExemptions.length} endpoint exemptions have no current failures (informational; see staleExemptions in the report).`,
    );
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
