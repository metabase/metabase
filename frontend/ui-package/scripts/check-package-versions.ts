/* eslint-disable no-console */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import semver from "semver";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string): PackageJson =>
  JSON.parse(readFileSync(file, "utf-8"));

const root = read(resolve(packageDir, "../../package.json"));
const pkg = read(resolve(packageDir, "package.json"));
const hostApp = read(resolve(packageDir, "host-app/package.json"));

type Deps = Record<string, string>;
interface PackageJson {
  dependencies?: Deps;
  devDependencies?: Deps;
  peerDependencies?: Deps;
}

function rootRange(name: string): string | undefined {
  for (const deps of [
    root.dependencies,
    root.devDependencies,
    root.peerDependencies,
  ]) {
    const range = deps?.[name];
    if (range) {
      return range;
    }
  }
}

// Temporary: the app is dropping Emotion; these must not fail the check when it does.
const TEMPORARY_DEPENDENCIES = new Set(["@emotion/react", "@emotion/cache"]);

const errors: string[] = [];

for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
  const expected = rootRange(name);
  if (!expected && TEMPORARY_DEPENDENCIES.has(name)) {
    console.warn(`${name}: gone from the root package.json, remove it`);
  } else if (!expected) {
    errors.push(`${name}: not declared in the root package.json`);
  } else if (expected !== range) {
    errors.push(`${name}: "${range}" differs from the root's "${expected}"`);
  }
}

for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
  const expected = rootRange(name);
  const version = expected && semver.minVersion(expected)?.version;
  if (!version) {
    errors.push(`${name}: not declared in the root package.json`);
  } else if (!semver.satisfies(version, range)) {
    errors.push(
      `${name}: peer range "${range}" excludes the root's ${expected}`,
    );
  } else if (name.startsWith("@mantine/") && !/^~?\d+\.\d+\.\d+$/.test(range)) {
    // styles.css embeds one Mantine version's CSS, so allow patch updates only.
    errors.push(`${name}: peer range "${range}" must be "~x.y.z" or exact`);
  }
}

// The host app must exercise the versions the package promises to support.
for (const name of Object.keys(pkg.peerDependencies ?? {})) {
  const isMantine = name.startsWith("@mantine/");
  if (!isMantine && name !== "react" && name !== "react-dom") {
    continue;
  }
  const hostRange = hostApp.dependencies?.[name];
  const peerRange = pkg.peerDependencies?.[name];
  if (!hostRange || !peerRange) {
    errors.push(`host-app: ${name} is not in its dependencies`);
  } else if (!semver.subset(hostRange, peerRange)) {
    errors.push(
      `host-app: ${name} "${hostRange}" is outside the peer range "${peerRange}"`,
    );
  } else if (isMantine && hostRange !== rootRange(name)) {
    errors.push(
      `host-app: ${name} "${hostRange}" differs from the root's "${rootRange(name)}"`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("All package versions are consistent with the root package.json.");
