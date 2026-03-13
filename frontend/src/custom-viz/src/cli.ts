#!/usr/bin/env node
/* eslint-disable metabase/no-literal-metabase-strings */
/* eslint-disable no-console */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command } from "commander";

import {
  generateGitignore,
  generateIndexTsx,
  generatePackageJson,
  generateTsConfig,
  generateViteConfig,
} from "./templates";

const program = new Command();

program
  .name("metabase-custom-viz")
  .description("CLI for creating custom visualizations for Metabase")
  .version("0.0.1");

program
  .command("init")
  .description("Scaffold a new custom visualization")
  .argument("<name>", "Name of the custom visualization")
  .action(async (rawName: string) => {
    const name = rawName.trim().replace(/\s+/g, "-").toLowerCase();

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

    await mkdir(join(name, "src"), { recursive: true });

    await Promise.all([
      writeFile(join(name, "package.json"), generatePackageJson(name)),
      writeFile(join(name, "vite.config.ts"), generateViteConfig()),
      writeFile(join(name, "tsconfig.json"), generateTsConfig()),
      writeFile(join(name, "src", "index.tsx"), generateIndexTsx(name)),
      writeFile(join(name, ".gitignore"), generateGitignore()),
    ]);

    console.log("Created files:");
    console.log(`  ${name}/package.json`);
    console.log(`  ${name}/vite.config.ts`);
    console.log(`  ${name}/tsconfig.json`);
    console.log(`  ${name}/src/index.tsx`);
    console.log(`  ${name}/.gitignore`);
    console.log();
    console.log("Next steps:");
    console.log(`  cd ${name}`);
    console.log("  npm install");
    console.log("  npm run dev      # Watch mode");
    console.log("  npm run build    # Production build");
  });

program.parse();
