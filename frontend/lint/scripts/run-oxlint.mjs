import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FLAGS = [
  "--disable-nested-config",
  "--max-warnings",
  "0",
  "--report-unused-disable-directives",
];
const DEFAULT_PATHS = ["enterprise/frontend", "frontend", "e2e"];

export function getOxlintArgs(args, pathExists) {
  const hasPath = args.some(
    (arg) => !arg.startsWith("-") && (pathExists(arg) || /[/.]/.test(arg)),
  );
  return [...FLAGS, ...args, ...(hasPath ? [] : DEFAULT_PATHS)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const oxlint = path.resolve(
    import.meta.dirname,
    "../../../node_modules/.bin/oxlint",
  );
  const result = spawnSync(
    oxlint,
    getOxlintArgs(process.argv.slice(2), fs.existsSync),
    { stdio: "inherit" },
  );
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}
