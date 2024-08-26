import { Command } from "commander";

import { start } from "./actions/start";

const program = new Command();

program
  .name("metabase-embedding-sdk-cli")
  .description("Metabase Embedding SDK CLI");

program
  .command("start")
  .description("downloads and starts a local Metabase instance")
  .action(start);

program.parse();
