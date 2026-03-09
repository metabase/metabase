import type { Command } from "commander";
import { getSchemaForCommand, listSchemaCommands } from "../core/schemas.js";
import { printResult } from "../core/output.js";

export function registerSchemaCommand(program: Command) {
  program
    .command("schema [command]")
    .description(
      "Print JSON Schema for a command's input. Run without args to list available schemas.",
    )
    .action((command?: string) => {
      if (!command) {
        printResult({
          available_schemas: listSchemaCommands(),
          usage: "metabase-agent schema <command-name>",
        });
        return;
      }

      const schema = getSchemaForCommand(command);
      if (!schema) {
        const available = listSchemaCommands();
        printResult({
          error: "unknown_command",
          message: `No schema found for command '${command}'`,
          available_schemas: available,
        });
        process.exitCode = 1;
        return;
      }

      printResult(schema);
    });
}
