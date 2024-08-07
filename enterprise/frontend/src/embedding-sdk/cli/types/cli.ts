import type { CLI_STEPS } from "embedding-sdk/cli/run";

export type CliState = Partial<{
  port: number;
  instanceUrl: string;
  cookie: string;
  apiKey: string;
  email: string;
  password: string;
  token: string;
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
