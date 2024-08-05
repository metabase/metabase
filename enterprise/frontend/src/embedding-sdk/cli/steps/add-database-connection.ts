import fs from "fs/promises";

import { select, input, password, number } from "@inquirer/prompts";
import chalk from "chalk";
import fileSelector from "inquirer-file-selector";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import type { Settings } from "metabase-types/api/settings";

import { fetchInstanceSettings } from "../utils/fetch-instance-settings";

export const addDatabaseConnectionStep: CliStepMethod = async state => {
  const settings = await fetchInstanceSettings({
    instanceUrl: state.instanceUrl ?? "http://localhost:3366",
  });

  const hasDatabase = await toggle({
    message:
      "Do you have a database to connect to? This will be used to embed your data.",
    default: true,
  });

  if (!hasDatabase || !settings || !settings.engines) {
    return [{ type: "error", message: "Aborted." }, state];
  }

  const engineKey = await select({
    message: "What database are you connecting to?",
    choices: getEngineOptions(settings),
  });

  const engine = settings.engines[engineKey];
  const fields = engine["details-fields"] ?? [];

  console.log("Selected Engine:", engineKey);
  console.log(JSON.stringify(fields, null, 2));

  const connection: Record<string, string | boolean | number | undefined> = {};

  for (const field of fields) {
    // Skip fields that are not shown in the CLI
    if (!SHOWN_DB_FIELDS.includes(field.name)) {
      continue;
    }

    const name = field["display-name"];
    const helperText = field["helper-text"];

    let value: string | boolean | number | undefined;

    const message = `${name}:`;

    if (helperText) {
      console.log(`  ${chalk.gray(helperText)}`);
    }

    if (field.type === "boolean") {
      value = await toggle({
        message,
        default: Boolean(field.default),
      });
    } else if (field.type === "password") {
      value = await password({
        message,
        mask: true,
      });
    } else if (field.type === "integer") {
      value = await number({
        message,
        required: field.required ?? false,
        ...(!!field.default && { default: Number(field.default) }),
      });
    } else if (field.type === "textFile") {
      const path = await fileSelector({ message });

      value = await fs.readFile(path, "utf-8");
    } else {
      value = await input({
        message,
        required: field.required ?? false,
        ...(!!field.default && { default: String(field.default) }),
      });
    }

    connection[field.name] = value;
  }

  console.log(JSON.stringify(connection, null, 2));

  return [{ type: "done" }, { ...state, settings }];
};

/** Prioritize database engines by popularity */
const POPULAR_DB_ENGINES = [
  "postgres",
  "mysql",
  "sqlserver",
  "redshift",
  "bigquery-cloud-sdk",
  "snowflake",
];

const SHOWN_DB_FIELDS = [
  "host",
  "port",
  "dbname",
  "user",
  "password",
  "ssl",
  "project-id",
  "service-account-json",
];

const getEngineOptions = (settings: Settings) => {
  const engines = Object.entries(settings.engines)
    .map(([key, engine]) => ({
      name: engine["driver-name"],
      value: key,
    }))
    .filter(engine => engine.value !== "h2");

  return [
    ...engines.filter(engine => POPULAR_DB_ENGINES.includes(engine.value)),
    ...engines.filter(engine => !POPULAR_DB_ENGINES.includes(engine.value)),
  ];
};
