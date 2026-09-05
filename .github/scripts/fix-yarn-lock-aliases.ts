/**
 * Renames aliased dependency keys in a bun-generated yarn.lock.
 *
 * Yarn names an alias entry after the alias, for example
 * `"typescript7@npm:typescript@7.0.2"`. Bun names it after the aliased package
 * instead, for example `"typescript@npm:typescript@7.0.2"`. Snyk follows the
 * yarn convention and fails to resolve the dependency.
 */

import { readFile, writeFile } from "node:fs/promises";

async function main() {
  const packageJsonPath = `${process.cwd()}/package.json`;
  const lockPath = `${process.cwd()}/yarn.lock`;

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  const dependencies = Object.entries<string>(
    Object.assign(
      {},
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.optionalDependencies,
    ),
  );

  let lock = await readFile(lockPath, "utf8");
  const renamedKeys: string[] = [];

  for (const [alias, specifier] of dependencies) {
    if (!specifier.startsWith("npm:")) {
      continue;
    }

    const aliasedPackage = specifier
      .slice("npm:".length)
      .replace(/@[^@]*$/, "");

    if (aliasedPackage === alias) {
      continue;
    }

    const bunKey = `"${aliasedPackage}@${specifier}"`;
    const yarnKey = `"${alias}@${specifier}"`;

    if (lock.includes(bunKey)) {
      lock = lock.replaceAll(bunKey, yarnKey);
      renamedKeys.push(`${bunKey} -> ${yarnKey}`);
    }
  }

  if (renamedKeys.length > 0) {
    await writeFile(lockPath, lock);
  }

  process.stdout.write(
    renamedKeys.length > 0
      ? `Renamed alias keys in yarn.lock:\n${renamedKeys.join("\n")}\n`
      : "No alias keys to rename in yarn.lock\n",
  );
}

main().catch((error) => {
  process.stderr.write(`Failed to rename alias keys in yarn.lock: ${error}\n`);
  process.exit(1);
});
