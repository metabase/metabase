/* eslint-disable no-console -- CLI diagnostics and coverage report */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import ts from "typescript";

import {
  type ContractResult,
  type ContractStatus,
  baselineProblems,
  checkContracts,
  formatResult,
  isFailing,
} from "./contracts";
import {
  BASELINE_PATH,
  CONTRACTS_REPORT_PATH,
  GENERATED_DECLARATIONS_PATH,
} from "./paths";

const USAGE =
  "Usage: bun run api-contract-check-pure [--update-baseline | --explain <endpoint>]";

const root = process.cwd();
const baselinePath = resolve(root, BASELINE_PATH);
const generatedPath = resolve(root, GENERATED_DECLARATIONS_PATH);
const reportPath = resolve(root, CONTRACTS_REPORT_PATH);

interface CliOptions {
  updateBaseline: boolean;
  explain: string | undefined;
}

type StatusCounts = Record<ContractStatus, number>;

function parseCliOptions(args: string[]): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        "update-baseline": { type: "boolean" },
        explain: { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new Error(USAGE);
  }
  const updateBaseline = values["update-baseline"] ?? false;
  const { explain } = values;
  if (explain === "" || (updateBaseline && explain !== undefined)) {
    throw new Error(USAGE);
  }
  return { updateBaseline, explain };
}

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

function readTsConfig(): ts.ParsedCommandLine {
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
  return parsed;
}

function runChecks(): ContractResult[] {
  const config = readTsConfig();
  const endpointFiles = config.fileNames.filter(
    (file) =>
      /\/frontend\/src\//.test(file) &&
      !/\.(?:spec|test)\./.test(file) &&
      /\b(?:query|mutation)\b/.test(readFileSync(file, "utf8")),
  );
  const program = ts.createProgram({
    rootNames: [
      ...endpointFiles,
      generatedPath,
      ...config.fileNames.filter((file) => file.endsWith(".d.ts")),
    ],
    options: { ...config.options, incremental: false, noEmit: true },
  });
  return checkContracts(program, endpointFiles, generatedPath, root);
}

function countByStatus(results: ContractResult[]): StatusCounts {
  const counts: StatusCounts = {
    compatible: 0,
    mismatch: 0,
    unverified: 0,
    ignored: 0,
  };
  for (const { status } of results) {
    counts[status] += 1;
  }
  return counts;
}

function formatCounts(counts: StatusCounts): string {
  return `${counts.compatible} compatible, ${counts.mismatch} mismatched, ${counts.unverified} unverified, ${counts.ignored} intentionally ignored`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function explain(results: ContractResult[], filter: string): void {
  const matching = results.filter((result) => result.id.includes(filter));
  if (!matching.length) {
    throw new Error(`No contract checks match ${JSON.stringify(filter)}.`);
  }
  for (const result of matching) {
    console.log(formatResult(result));
  }
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const results = runChecks();
  const failingEndpoints = new Set(
    results.filter(isFailing).map((result) => result.endpointId),
  );
  const exemptEndpoints = options.updateBaseline
    ? [...failingEndpoints].sort()
    : readBaseline();
  const staleExemptions = exemptEndpoints.filter(
    (id) => !failingEndpoints.has(id),
  );
  const counts = countByStatus(results);
  const responseCounts = countByStatus(
    results.filter((result) => result.kind === "response"),
  );
  const endpointCount = new Set(results.map((result) => result.endpointId))
    .size;
  writeJson(reportPath, {
    endpointCount,
    counts,
    responseCounts,
    exemptEndpoints,
    staleExemptions,
    results,
  });

  if (options.explain !== undefined) {
    explain(results, options.explain);
  }
  if (options.updateBaseline) {
    writeJson(baselinePath, exemptEndpoints);
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
  console.log(`API contracts: ${formatCounts(counts)}.`);
  console.log(
    `Response contracts: ${formatCounts(responseCounts)} (${endpointCount} endpoints discovered).`,
  );
  console.log(`Details: ${reportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
