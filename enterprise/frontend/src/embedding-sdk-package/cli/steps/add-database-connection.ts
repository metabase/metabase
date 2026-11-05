import { search } from "@inquirer/prompts";
import ora from "ora";

import type { CliStepMethod } from "embedding-sdk-package/cli/types/cli";
import type { Engine } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

import { CLI_SHOWN_DB_ENGINES, SAMPLE_DB_ID } from "../constants/database";
import { addDatabaseConnection } from "../utils/add-database-connection";
import { askForDatabaseConnectionInfo } from "../utils/ask-for-db-connection-info";
import { fetchEngines } from "../utils/fetch-engines";

export const addDatabaseConnectionStep: CliStepMethod = async (state) => {
  const engines = await fetchEngines({
    instanceUrl: state.instanceUrl ?? "",
    cookie: state.cookie ?? "",
  });

  if (!engines) {
    return [{ type: "error", message: "Aborted." }, state];
  }

  if (state.useSampleDatabase) {
    return [{ type: "success" }, { ...state, databaseId: SAMPLE_DB_ID }];
  }

  const engineChoices = getEngineChoices(engines);

  while (true) {
    const engineKey = await search({
      pageSize: 10,
      message: "What database are you connecting to?",
      source(term) {
        return term
          ? engineChoices.filter((choice) =>
              choice.name.toLowerCase().includes(term.toLowerCase()),
            )
          : engineChoices;
      },
    });

    if (!isEngineKey(engineKey)) {
      return [{ type: "error", message: "Invalid engine key." }, state];
    }

    const engine = engines[engineKey];
    const engineName = engine["driver-name"];

    const spinner = ora("Adding database connection…");

    try {
      const connection = await askForDatabaseConnectionInfo({
        engine,
        engineKey,
      });

      spinner.start();

      const databaseId = await addDatabaseConnection({
        name: engineName,
        engine: engineKey,
        connection,

        cookie: state.cookie ?? "",
        instanceUrl: state.instanceUrl ?? "",
      });

      spinner.succeed();

      return [{ type: "done" }, { ...state, databaseId }];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      spinner.fail(`Cannot connect to the database. Reason: ${reason}`);
    }
  }
};

const getEngineChoices = (engines: Record<string, Engine>) =>
  Object.entries(engines)
    .map(([key, engine]) => ({ name: engine["driver-name"], value: key }))
    .filter((engine) => CLI_SHOWN_DB_ENGINES.includes(engine.value));
