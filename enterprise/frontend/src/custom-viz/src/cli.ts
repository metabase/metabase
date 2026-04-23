#!/usr/bin/env node
/* eslint-disable metabase/no-literal-metabase-strings */
/* eslint-disable no-console */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command } from "commander";

import { version } from "../package.json";

import {
  generateGitignore,
  generateIconSvg,
  generateIndexTsx,
  generateManifest,
  generatePackageJson,
  generateReadme,
  generateTsConfig,
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
      writeFile(join(name, "README.md"), generateReadme(name, displayName)),
    ]);

    console.log("Created files:");
    console.log(`  ${name}/package.json`);
    console.log(`  ${name}/vite.config.ts`);
    console.log(`  ${name}/tsconfig.json`);
    console.log(`  ${name}/src/index.tsx`);
    console.log(`  ${name}/metabase-plugin.json`);
    console.log(`  ${name}/public/assets/icon.svg`);
    console.log(`  ${name}/public/assets/thumbs-up.png`);
    console.log(`  ${name}/public/assets/thumbs-down.png`);
    console.log(`  ${name}/.gitignore`);
    console.log(`  ${name}/README.md`);
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

program.parse();
