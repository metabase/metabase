import ora from "ora";

import { createXrayDashboardFromModel } from "embedding-sdk/cli/utils/xray-models";
import type { DashboardId } from "metabase-types/api";

import type { CliStepMethod } from "../types/cli";
import { createModelFromTable } from "../utils/create-model-from-table";

export const createModelsAndXrays: CliStepMethod = async state => {
  const { instanceUrl = "", databaseId, cookie = "", tables = [] } = state;

  if (databaseId === undefined) {
    return [{ type: "error", message: "No database selected." }, state];
  }

  const spinner = ora("Creating models…").start();

  try {
    // Create a model for each table
    const modelIds = await Promise.all(
      tables.map(table =>
        createModelFromTable({
          table,
          databaseId,
          cookie,
          instanceUrl,
        }),
      ),
    );

    spinner.start("X-raying your data to create dashboards...");

    const dashboardIds: DashboardId[] = [];

    // We one generate dashboard at a time to prevent multiple
    // "Automatically Generated Dashboards" collection from being created.
    for (const modelId of modelIds) {
      const dashboardId = await createXrayDashboardFromModel({
        modelId,
        instanceUrl,
        cookie,
      });

      dashboardIds.push(dashboardId);
    }

    spinner.succeed();

    return [{ type: "done" }, { ...state, dashboardIds }];
  } catch (error) {
    spinner.fail();

    const reason = error instanceof Error ? error.message : String(error);
    const message = `Cannot create models from selected tables. Reason: ${reason}`;

    return [{ type: "error", message }, state];
  }
};
