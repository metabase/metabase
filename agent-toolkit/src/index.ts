import { Command } from "commander";
import { resolveAuth } from "./core/auth.js";
import { createMetabaseClient, type MetabaseClient } from "./core/client.js";
import { printError, printResult, type OutputOptions } from "./core/output.js";
import { CliError } from "./core/validation.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerDatabaseCommands } from "./commands/database.js";
import { registerTableCommands } from "./commands/table.js";
import { registerTransformCommands } from "./commands/transform.js";
import { registerQuestionCommands } from "./commands/question.js";
import { registerSegmentCommands } from "./commands/segment.js";
import { registerDashboardCommands } from "./commands/dashboard.js";
import { registerQueryCommands } from "./commands/query.js";
import { registerConstructQueryCommands } from "./commands/construct-query.js";
import { registerMeasureCommands } from "./commands/measure.js";
import { registerFieldCommands } from "./commands/field.js";
import { registerSchemaCommand } from "./commands/schema-cmd.js";

export interface GlobalContext {
  client: MetabaseClient;
  outputOpts: OutputOptions;
  dryRun: boolean;
}

function createContext(opts: {
  url?: string;
  apiKey?: string;
  sessionToken?: string;
  fields?: string;
  maxRows?: string;
  dryRun?: boolean;
}): GlobalContext {
  const baseUrl = opts.url || process.env.METABASE_URL;
  if (!baseUrl) {
    throw new CliError("missing_config", {
      message:
        "Metabase URL required. Set METABASE_URL environment variable or pass --url.",
    });
  }

  const auth = resolveAuth({
    apiKey: opts.apiKey,
    sessionToken: opts.sessionToken,
  });

  const client = createMetabaseClient({ baseUrl, auth });

  const fields = opts.fields?.split(",").map((f) => f.trim());
  const maxRows = opts.maxRows ? parseInt(opts.maxRows, 10) : 50;

  return {
    client,
    outputOpts: { fields, maxRows },
    dryRun: opts.dryRun ?? false,
  };
}

const program = new Command();

program
  .name("metabase-agent")
  .description(
    "Agent-friendly CLI for Metabase — discover data, create transforms, build dashboards",
  )
  .version("0.1.0")
  .option("--url <url>", "Metabase instance URL (or METABASE_URL env)")
  .option("--api-key <key>", "API key (or METABASE_API_KEY env)")
  .option(
    "--session-token <token>",
    "Session token (or METABASE_SESSION_TOKEN env)",
  )
  .option("--fields <fields>", "Comma-separated field mask for response")
  .option("--max-rows <n>", "Max rows in query results (default: 50)")
  .option("--dry-run", "Show resolved API calls without executing");

// Wrap command actions to handle errors and create context
function withContext(
  fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
) {
  return async (...args: unknown[]) => {
    try {
      const cmd = args[args.length - 1] as Command;
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createContext(globalOpts);
      await fn(ctx, ...args.slice(0, -1));
    } catch (error) {
      printError(error);
    }
  };
}

// Register all commands
registerSearchCommand(program, withContext);
registerDatabaseCommands(program, withContext);
registerTableCommands(program, withContext);
registerTransformCommands(program, withContext);
registerQuestionCommands(program, withContext);
registerSegmentCommands(program, withContext);
registerDashboardCommands(program, withContext);
registerQueryCommands(program, withContext);
registerConstructQueryCommands(program, withContext);
registerMeasureCommands(program, withContext);
registerFieldCommands(program, withContext);
registerSchemaCommand(program);

// Ping command (simple, inline)
program
  .command("ping")
  .description("Health check — verify connection to Metabase")
  .action(
    withContext(async (ctx) => {
      const { data } = await ctx.client.GET("/api/health");
      printResult(data);
    }),
  );

program.parse();
