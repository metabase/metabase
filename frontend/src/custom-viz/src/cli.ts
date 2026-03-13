#!/usr/bin/env node
/* eslint-disable metabase/no-literal-metabase-strings */

import { Command } from "commander";

const program = new Command();

program
  .name("metabase-custom-viz")
  .description("CLI for creating custom visualizations for Metabase")
  .version("0.0.1");

program
  .command("init")
  .description("Scaffold a new custom visualization")
  .argument("<name>", "Name of the custom visualization")
  .action((name: string) => {
    // eslint-disable-next-line no-console
    console.log(`Scaffolding custom visualization: ${name}`);
    // TODO: implement scaffolding
  });

program.parse();
