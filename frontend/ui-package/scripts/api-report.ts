import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (mode !== "check" && mode !== "update") {
  console.error("Usage: api-report.ts <check|update>");
  process.exit(1);
}

// Without --local, api-extractor fails when api/ui.api.md differs from the build.
const result = spawnSync(
  resolve(packageDir, "../../node_modules/.bin/api-extractor"),
  [
    "run",
    ...(mode === "update" ? ["--local"] : []),
    "-c",
    "api-extractor.json",
  ],
  { cwd: packageDir, stdio: "inherit" },
);

if (result.status !== 0 && mode === "check") {
  console.error(
    "\nThe API report is out of date. Run `bun run api:update` in frontend/ui-package and commit api/ui.api.md.",
  );
}
process.exit(result.status ?? 1);
