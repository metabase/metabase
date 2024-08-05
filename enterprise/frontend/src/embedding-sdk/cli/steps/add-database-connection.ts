import { select } from "@inquirer/prompts";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import type { Settings } from "metabase-types/api/settings";

import { CLI_SHOWN_DB_ENGINES } from "../constants/database";
import { addDatabaseConnection } from "../utils/add-database-connection";
import { askForDatabaseConnectionInfo } from "../utils/ask-for-db-connection-info";
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

    try {
      const connection = await askForDatabaseConnectionInfo({
        engine,
        engineKey,
      });

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

const getEngineChoices = (settings: Settings) =>
  Object.entries(settings.engines)
    .map(([key, engine]) => ({ name: engine["driver-name"], value: key }))
    .filter(engine => CLI_SHOWN_DB_ENGINES.includes(engine.value));
