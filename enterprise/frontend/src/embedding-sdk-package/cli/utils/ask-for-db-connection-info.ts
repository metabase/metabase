import { EventEmitter } from "events";
import fs from "fs/promises";

import { input, number, password, select } from "@inquirer/prompts";
import fileSelector from "inquirer-file-selector";
import toggle from "inquirer-toggle";
import { match } from "ts-pattern";

import type {
  DatabaseFieldOrGroup,
  Engine,
  EngineField,
} from "metabase-types/api";

import { CLI_SHOWN_DB_FIELDS } from "../constants/database";

import { printHelperText } from "./print";

interface Options {
  engine: Engine;
  engineKey: string;
}

// FIXME: a bug in the @inquirer/prompts library caused the prompt's listeners to not be cleaned up.
//        We can remove this once https://github.com/SBoudrias/Inquirer.js/pull/1499 is released.
EventEmitter.defaultMaxListeners = 500;

export async function askForDatabaseConnectionInfo(options: Options) {
  const { engine, engineKey } = options;

  const fields = getFlattenedFields(engine["details-fields"] ?? []);

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
      printHelperText(helperText);
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
    .with("select", () => {
      return select({
        message,
        choices: field.options ?? [],
        default: field.default,
      });
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
  // Postgres allows connecting with either password or an authentication provider.
  if (field.name === "use-auth-provider") {
    const choice = await select({
      message:
        "Do you want to connect with password or an authentication provider?",
      choices: [
        { name: "Password", value: "password" },
        { name: "Auth Provider", value: "auth-provider" },
      ],
      default: "password",
    });

    return choice === "auth-provider";
  }

  // Snowflake allows connecting with either hostname or account name.
  if (field.name === "use-hostname") {
    return select({
      message: "Do you want to connect with hostname or account name?",
      choices: [
        { name: "Hostname", value: true },
        { name: "Account name", value: false },
      ],
      default: field.default,
    });
  }

  // MongoDB allows connecting with either hostname or connection string.
  if (field.name === "use-conn-uri") {
    return select({
      message: "Do you want to connect with hostname or connection string?",
      choices: [
        { name: "Hostname", value: false },
        { name: "Connection String", value: true },
      ],
      default: field.default,
    });
  }
};

export function getFlattenedFields(
  fields: DatabaseFieldOrGroup[],
): EngineField[] {
  return fields.reduce<EngineField[]>((acc, field) => {
    if (field.type === "group") {
      acc.push(...field.fields);
    } else {
      acc.push(field);
    }
    return acc;
  }, []);
}
