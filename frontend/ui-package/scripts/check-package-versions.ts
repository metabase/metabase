/* eslint-disable no-console */
import { resolve } from "path";

import semver from "semver";

import { readPackageJson as read } from "./package-json";

const packageDir = resolve(import.meta.dirname, "..");
const root = read(resolve(packageDir, "../../package.json"));
const pkg = read(resolve(packageDir, "package.json"));
const smokeApp = read(resolve(packageDir, "smoke-app/package.json"));

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

const errors: string[] = [];

for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
  const expected = rootRange(name);
  if (!expected) {
    errors.push(`${name}: not declared in the root package.json`);
  } else if (expected.replace(/^[\^~]/, "") !== range.replace(/^[\^~]/, "")) {
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

// The smoke app must exercise the versions the package promises to support.
for (const name of Object.keys(pkg.peerDependencies ?? {})) {
  const isMantine = name.startsWith("@mantine/");
  if (!isMantine && name !== "react" && name !== "react-dom") {
    continue;
  }
  const smokeRange = smokeApp.dependencies?.[name];
  const peerRange = pkg.peerDependencies?.[name];
  if (!smokeRange || !peerRange) {
    errors.push(`smoke-app: ${name} is not in its dependencies`);
  } else if (!semver.subset(smokeRange, peerRange)) {
    errors.push(
      `smoke-app: ${name} "${smokeRange}" is outside the peer range "${peerRange}"`,
    );
  } else if (isMantine && smokeRange !== rootRange(name)) {
    errors.push(
      `smoke-app: ${name} "${smokeRange}" differs from the root's "${rootRange(name)}"`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("All package versions are consistent with the root package.json.");
