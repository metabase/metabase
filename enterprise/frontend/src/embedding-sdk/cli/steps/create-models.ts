import type { CliStepMethod } from "../types/cli";
import { createModelFromTable } from "../utils/create-model-from-table";

export const createModels: CliStepMethod = async state => {
  const { instanceUrl = "", databaseId, cookie = "", tableIds = [] } = state;

  if (databaseId === undefined) {
    return [{ type: "error", message: "No database selected." }, state];
  }

  // Create a model for each table
  await Promise.all(
    tableIds.map(tableId =>
      createModelFromTable({
        instanceUrl,
        databaseId,
        tableId,
        cookie,
      }),
    ),
  );

  return [{ type: "done" }, state];
};
