import type { CLI_STEPS } from "embedding-sdk/cli/run";
import type { Settings, Table } from "metabase-types/api";

import type { DashboardInfo } from "../types/dashboard";

export type CliState = Partial<{
  port: number;
  instanceUrl: string;
  cookie: string;
  apiKey: string;
  email: string;
  password: string;
  token: string;
  databaseId: number;

  /** Metabase instance settings */
  settings: Settings;

  /** Database tables present in the instance */
  tables: Table[];

  /** Database tables selected by the user */
  chosenTables: Table[];

  /** IDs and names of auto-generated dashboards */
  dashboards: DashboardInfo[];

  /** Sample values of the tenancy column (e.g. customer_id) in the selected tables */
  tenancyColumnValues: (string | number)[];
}>;

export type CliError = {
  type: "error";
  message: string;
};

export type CliSuccess = {
  type: "success";
  nextStep?: typeof CLI_STEPS[number]["id"];
};

export type CliDone = {
  type: "done";
};

export type CliStepType = CliError | CliSuccess | CliDone;

export type CliOutput = [CliStepType, CliState];

export type CliStepMethod = (
  state: CliState,
  ...options: any[]
) => CliOutput | Promise<CliOutput>;
