import ora from "ora";

import type { CliStepMethod } from "../types/cli";
import type { DashboardInfo } from "../types/dashboard";
import { createModelFromTable } from "../utils/create-model-from-table";
import { createXrayDashboardFromModel } from "../utils/xray-models";

export const createModelsAndXrays: CliStepMethod = async state => {
  const { instanceUrl = "", databaseId, cookie = "", tables = [] } = state;

  if (databaseId === undefined) {
    return [{ type: "error", message: "No database selected." }, state];
  }

  const spinner = ora("Creating models…").start();

  try {
    // Create a model for each table
    const models = await Promise.all(
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

    const dashboards: DashboardInfo[] = [];

    // We create dashboard sequentially to prevent multiple
    // "Automatically Generated Dashboards" collection from being created.
    for (const model of models) {
      const dashboardId = await createXrayDashboardFromModel({
        modelId: model.modelId,
        instanceUrl,
        cookie,
      });

      dashboards.push({ id: dashboardId, name: model.modelName });
    }

    spinner.succeed();

    return [{ type: "done" }, { ...state, dashboards }];
  } catch (error) {
    spinner.fail();

    const reason = error instanceof Error ? error.message : String(error);
    const message = `Cannot create models from selected tables. Reason: ${reason}`;

    return [{ type: "error", message }, state];
  }
};
