import fs from "fs/promises";

import { input, number, password, select } from "@inquirer/prompts";
import chalk from "chalk";
import { EventEmitter } from "events";
import fileSelector from "inquirer-file-selector";
import toggle from "inquirer-toggle";
import { match } from "ts-pattern";

import type { Engine, EngineField } from "metabase-types/api";

import { CLI_SHOWN_DB_FIELDS } from "../constants/database";

interface Options {
  engine: Engine;
  engineKey: string;
}

// FIXME: a bug in the @inquirer/prompts library caused the prompt's listeners to not be cleaned up.
//        We can remove this once https://github.com/SBoudrias/Inquirer.js/pull/1499 is released.
EventEmitter.defaultMaxListeners = 500;

export async function askForDatabaseConnectionInfo(options: Options) {
  const { engine, engineKey } = options;

  const fields = engine["details-fields"] ?? [];

  const connection: Record<string, string | boolean | number> = {};

  for (const field of fields) {
    // Skip fields that are not shown in the CLI
    if (!CLI_SHOWN_DB_FIELDS.includes(field.name)) {
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

    const value = await askForConnectionValue(field, message, engineKey);

    if (value !== undefined) {
      connection[field.name] = value;
    }
  }

  return connection;
}

const askForConnectionValue = (
  field: EngineField,
  message: string,
  engine: string,
) =>
  match(field.type)
    .with("boolean", () => toggle({ message, default: Boolean(field.default) }))
    .with("password", () => password({ message, mask: true }))
    .with("integer", () =>
      number({
        message,
        required: field.required ?? false,
        ...getIntegerFieldDefault(field, engine),
      }),
    )
    .with("textFile", async () => {
      const path = await fileSelector({ message });

      return fs.readFile(path, "utf-8");
    })
    .with("section", () => askSectionChoice(field))
    .otherwise(() =>
      input({
        message,
        required: field.required ?? false,
        ...(!!field.default && { default: String(field.default) }),
      }),
    );

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

const askSectionChoice = async (field: EngineField) => {
  // Snowflake allows to connect with either hostname or account name.
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

  // MongoDB allows to connect with either hostname or connection string.
  if (field.name === "use-conn-uri") {
    const choice = await select({
      message: "Do you want to connect with hostname or connection string?",
      choices: [
        { name: "Hostname", value: "hostname" },
        { name: "Connection String", value: "conn-uri" },
      ],
    });

    return choice === "conn-uri";
  }
};
