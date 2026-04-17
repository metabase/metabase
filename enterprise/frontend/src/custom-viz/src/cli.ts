#!/usr/bin/env node
/* eslint-disable metabase/no-literal-metabase-strings */
/* eslint-disable no-console */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { Command } from "commander";

import { version } from "../package.json";

import {
  generateGitignore,
  generateIconSvg,
  generateIndexTsx,
  generateManifest,
  generatePackageJson,
  generatePackageLockJson,
  generateTsConfig,
  generateUpgradePackageJson,
  generateViteConfig,
  readBinaryTemplate,
} from "./templates";

const program = new Command();

program
  .name("metabase-custom-viz")
  .description("CLI for creating custom visualizations for Metabase")
  .version(version);

program
  .command("init")
  .description("Scaffold a new custom visualization")
  .argument("<name>", "Name of the custom visualization")
  .action(async (rawName: string) => {
    const displayName = rawName.trim();
    const name = displayName.replace(/\s+/g, "-").toLowerCase();

    if (!name || !/^[a-z0-9@][a-z0-9._\-/]*$/.test(name)) {
      console.error(
        `Error: "${rawName}" is not a valid project name. Use letters, numbers, hyphens, and dots.`,
      );
      process.exit(1);
    }

    if (existsSync(name)) {
      console.error(`Error: Directory "${name}" already exists.`);
      process.exit(1);
    }

    console.log(`Scaffolding custom visualization: ${name}\n`);

    await Promise.all([
      mkdir(join(name, "src"), { recursive: true }),
      mkdir(join(name, "public", "assets"), { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(name, "package.json"), generatePackageJson(name)),
      writeFile(join(name, "package-lock.json"), generatePackageLockJson(name)),
      writeFile(join(name, "vite.config.ts"), generateViteConfig()),
      writeFile(join(name, "tsconfig.json"), generateTsConfig()),
      writeFile(
        join(name, "src", "index.tsx"),
        generateIndexTsx(name, displayName),
      ),
      writeFile(join(name, "metabase-plugin.json"), generateManifest(name)),
      writeFile(join(name, "public", "assets", "icon.svg"), generateIconSvg()),
      writeFile(
        join(name, "public", "assets", "thumbs-up.png"),
        readBinaryTemplate("thumbs-up.png"),
      ),
      writeFile(
        join(name, "public", "assets", "thumbs-down.png"),
        readBinaryTemplate("thumbs-down.png"),
      ),
      writeFile(join(name, ".gitignore"), generateGitignore()),
    ]);

    console.log("Created files:");
    console.log(`  ${name}/package.json`);
    console.log(`  ${name}/package-lock.json`);
    console.log(`  ${name}/vite.config.ts`);
    console.log(`  ${name}/tsconfig.json`);
    console.log(`  ${name}/src/index.tsx`);
    console.log(`  ${name}/metabase-plugin.json`);
    console.log(`  ${name}/public/assets/icon.svg`);
    console.log(`  ${name}/public/assets/thumbs-up.png`);
    console.log(`  ${name}/public/assets/thumbs-down.png`);
    console.log(`  ${name}/.gitignore`);
    console.log();
    console.log("Next steps:");
    console.log(`  cd ${name}`);
    console.log("  npm install");
    console.log("  npm run dev      # Start dev server with hot-reload");
    console.log("  npm run build    # Production build");
    console.log();
    console.log("Syncing with a Metabase instance:");
    console.log(
      "  1. Register your plugin in Metabase Admin → Custom visualizations → Development",
    );
    console.log("  2. Set the dev server URL to http://localhost:5174");
    console.log(
      "  3. Changes will hot-reload automatically in your Metabase instance",
    );
  });

program
  .command("upgrade")
  .description(
    "Upgrade an existing custom visualization to the latest template version",
  )
  .action(async () => {
    const projectDir = process.cwd();
    const pkgPath = join(projectDir, "package.json");

    if (!existsSync(pkgPath)) {
      console.error(
        "Error: No package.json found. Run this command from the root of a custom visualization project.",
      );
      process.exit(1);
    }

    let pkg: {
      name?: string;
      devDependencies?: Record<string, string>;
    };
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch {
      console.error("Error: Could not parse package.json.");
      process.exit(1);
    }

    const currentVersion = pkg.devDependencies?.["@metabase/custom-viz"];
    if (!currentVersion) {
      console.error(
        "Error: @metabase/custom-viz not found in devDependencies. Is this a custom visualization project?",
      );
      process.exit(1);
    }

    if (currentVersion === version) {
      console.log(`Already up to date (v${version}). No changes needed.`);
      return;
    }

    console.log(
      `Upgrading from @metabase/custom-viz ${currentVersion} → ${version}\n`,
    );

    console.log("The following changes will be made:\n");
    console.log(
      "  vite.config.ts   — Replace with the latest build configuration",
    );
    console.log(
      "  tsconfig.json    — Replace with the latest TypeScript configuration",
    );
    console.log("  .gitignore       — Replace with the latest gitignore rules");
    console.log(
      "  package.json     — Update devDependencies and scripts to latest versions",
    );
    console.log();
    console.log(
      "Your source code (src/), assets (public/), and metabase-plugin.json will NOT be modified.\n",
    );

    const confirmed = await confirm("Proceed with upgrade?");
    if (!confirmed) {
      console.log("Upgrade cancelled.");
      return;
    }

    console.log();

    const updated: string[] = [];

    // Update infrastructure files that are template-owned
    await writeFile(join(projectDir, "vite.config.ts"), generateViteConfig());
    updated.push("vite.config.ts");

    await writeFile(join(projectDir, "tsconfig.json"), generateTsConfig());
    updated.push("tsconfig.json");

    await writeFile(join(projectDir, ".gitignore"), generateGitignore());
    updated.push(".gitignore");

    // Update package.json: merge devDependencies from template, preserve user additions
    const existingPkgJson = readFileSync(pkgPath, "utf-8");
    const updatedPkgJson = generateUpgradePackageJson(existingPkgJson);
    await writeFile(pkgPath, updatedPkgJson);
    updated.push("package.json");

    console.log("Updated files:");
    for (const file of updated) {
      console.log(`  ${file}`);
    }
    console.log();
    console.log("Next steps:");
    console.log("  npm install     # Install updated dependencies");
  });

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

program.parse();
