/* eslint-disable no-console */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const files: Record<string, string> = {
  "metabase root": resolve(__dirname, "../../../../../package.json"),
  "custom-viz sdk": resolve(__dirname, "../package.json"),
  "viz template": resolve(__dirname, "../src/templates/package.json"),
};

const PACKAGES = ["react", "@types/react"];

function getVersion(
  pkg: Record<string, Record<string, string> | undefined>,
  name: string,
): string | undefined {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = pkg[field];
    if (section?.[name]) {
      return section[name];
    }
  }
  return undefined;
}

let failed = false;

for (const packageName of PACKAGES) {
  const versions = Object.entries(files).map(([label, filePath]) => {
    const pkg = JSON.parse(readFileSync(filePath, "utf-8"));
    return { label, version: getVersion(pkg, packageName) };
  });

  const declared = versions.filter((v) => v.version !== undefined);
  const unique = new Set(declared.map((v) => v.version));
  const status = unique.size > 1 ? "MISMATCH" : "ok";

  console.log(`\n${packageName} [${status}]`);
  for (const { label, version } of versions) {
    console.log(`  ${label}: ${version ?? "(not declared)"}`);
  }

  if (unique.size > 1) {
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nVersion mismatch detected. Please align react versions across the files above.",
  );
  process.exit(1);
}

console.log("\nAll react versions are consistent.");
