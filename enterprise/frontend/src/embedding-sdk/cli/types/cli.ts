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

  /** User does not have a database, so the sample database is used instead. */
  useSampleDatabase: boolean;

  /** Metabase instance settings */
  settings: Settings;

  /** Database tables present in the instance */
  tables: Table[];

  /** Database tables selected by the user */
  chosenTables: Table[];

  /** IDs and names of auto-generated dashboards */
  dashboards: DashboardInfo[];

  /** Tenancy column names for the selected tables (e.g. orders -> shop_id) */
  tenancyColumnNames: Record<string, string>;

  /** Sampled values of the tenancy columns from the selected tables (e.g. tenancy_id -> [1, 2, 3]) */
  tenantIdsMap: Record<string, (string | number)[]>;

  /** ID of the "Our models" collection */
  modelCollectionId: number;

  /** Directory where the Express.js mock server is saved to */
  mockServerDir: string;

  /** Directory where the React components are saved to */
  reactComponentDir: string;
}>;

export type CliError = {
  type: "error";
  message: string;
};

export type CliSuccess = {
  type: "success";
  nextStep?: (typeof CLI_STEPS)[number]["id"];
};

export type CliDone = {
  type: "done";
};

export type CliStepConfig = {
  id: string;
  executeStep: CliStepMethod;
  runIf?: (state: CliState) => boolean;
};

export type CliStepType = CliError | CliSuccess | CliDone;

export type CliOutput = [CliStepType, CliState];

export type CliStepMethod = (
  state: CliState,
  ...options: any[]
) => CliOutput | Promise<CliOutput>;
