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
  nextStep?: CliStep;
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

export const CLI_ORDER = [
  "TITLE",
  "CHECK_REACT_PROJECT",
  "CHECK_SDK_VERSION",
  "ADD_EMBEDDING_TOKEN",
  "CHECK_DOCKER_RUNNING",
  "GENERATE_CREDENTIALS",
  "START_LOCAL_METABASE_CONTAINER",
  "POLL_METABASE_INSTANCE",
  "SETUP_METABASE_INSTANCE",
  "CREATE_API_KEY",
  "GET_CODE_SAMPLE",
];

export type CliStep = typeof CLI_ORDER[number];
