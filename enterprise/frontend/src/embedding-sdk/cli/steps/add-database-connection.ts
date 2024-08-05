import fs from "fs/promises";

import { select, input, password, number } from "@inquirer/prompts";
import chalk from "chalk";
import fileSelector from "inquirer-file-selector";
import toggle from "inquirer-toggle";
import { match } from "ts-pattern";
import _ from "underscore";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import type { EngineField, Settings } from "metabase-types/api/settings";

import { addDatabaseConnection } from "../utils/add-database-connection";
import { fetchInstanceSettings } from "../utils/fetch-instance-settings";
import { printError } from "../utils/print";

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

  // eslint-disable-next-line no-constant-condition -- keep asking until the user enters a valid connection.
  while (true) {
    const engineKey = await select({
      message: "What database are you connecting to?",
      choices: getEngineChoices(settings),
    });

    const engine = settings.engines[engineKey];
    const engineName = engine["driver-name"];
    const fields = engine["details-fields"] ?? [];

    const connection: Record<string, string | boolean | number> = {};

    for (const field of fields) {
      // Skip fields that are not shown in the CLI
      if (!SHOWN_DB_FIELDS.includes(field.name)) {
        continue;
      }

      const visibleIf = field["visible-if"];

      const shouldShowField =
        !visibleIf ||
        Object.entries(visibleIf).every(
          ([key, expected]) => connection[key] === expected,
        );

      // Skip fields that should be hidden
      if (!shouldShowField) {
        continue;
      }

      const name = field["display-name"];
      const helperText = field["helper-text"];

      const message = `${name}:`;

      if (helperText) {
        console.log(`  ${chalk.gray(helperText)}`);
      }

      const value = await match(field.type)
        .with("boolean", () =>
          toggle({ message, default: Boolean(field.default) }),
        )
        .with("password", () =>
          password({
            message,
            mask: true,
          }),
        )
        .with("integer", () =>
          number({
            message,
            required: field.required ?? false,
            ...getIntegerFieldDefault(field, engineKey),
          }),
        )
        .with("textFile", async () => {
          const path = await fileSelector({ message });

          return fs.readFile(path, "utf-8");
        })
        .with("section", async () => {
          if (field.name === "use-hostname") {
            const choice = await select({
              message: "Do you want to connect with hostname or account name?",
              choices: [
                { name: "Hostname", value: "hostname" },
                { name: "Account name", value: "account" },
              ],
            });

            return choice === "hostname";
          }

          if (field.name === "use-conn-uri") {
            const choice = await select({
              message:
                "Do you want to connect with hostname or connection string?",
              choices: [
                { name: "Hostname", value: "hostname" },
                { name: "Connection String", value: "conn-uri" },
              ],
            });

            return choice === "conn-uri";
          }
        })
        .otherwise(() =>
          input({
            message,
            required: field.required ?? false,
            ...(!!field.default && { default: String(field.default) }),
          }),
        );

      if (value !== undefined) {
        connection[field.name] = value;
      }
    }

    try {
      await addDatabaseConnection({
        name: engineName,
        engine: engineKey,
        connection,

        cookie: state.cookie ?? "",
        instanceUrl: state.instanceUrl ?? "",
      });

      break;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      printError(`Cannot connect to the database. Reason: ${reason}`);
    }
  }

  return [{ type: "done" }, { ...state, settings }];
};

/** Show popular database engines in the CLI */
const SHOWN_DB_ENGINES = [
  "postgres",
  "mysql",
  "sqlserver",
  "bigquery-cloud-sdk",
  "snowflake",
  "redshift",
  "mongo",
  "athena",
];

/** Database connection fields that are shown in the CLI */
const SHOWN_DB_FIELDS = [
  // Common connection fields for all databases
  "host",
  "port",
  "dbname",
  "user",
  "pass",
  "password",
  "ssl",

  // Snowflake fields
  "use-hostname",
  "account",

  // BigQuery fields
  "project-id",
  "service-account-json",

  // Amazon Athena fields
  "region",
  "workgroup",
  "s3_staging_dir",
  "access_key",
  "secret_key",

  // MongoDB fields
  "use-conn-uri",
  "conn-uri",
  "authdb",
];

const getEngineChoices = (settings: Settings) =>
  Object.entries(settings.engines)
    .map(([key, engine]) => ({ name: engine["driver-name"], value: key }))
    .filter(engine => SHOWN_DB_ENGINES.includes(engine.value));

const getIntegerFieldDefault = (field: EngineField, engine: string) => {
  if (field.default) {
    return { default: Number(field.default) };
  }

  if (field.name === "port") {
    if (engine === "postgres") {
      return { default: 5432 };
    }
  }
};
