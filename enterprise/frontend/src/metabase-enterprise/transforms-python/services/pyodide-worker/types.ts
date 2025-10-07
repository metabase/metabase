export type PythonLibraries = Record<string, string>;

export type PyodideWorkerCommand = PyodideExecuteCommand;

export type PyodideExecuteCommand = {
  type: "execute";
  code: string;
  libraries: PythonLibraries;
};

export type PyodideErrorMessage = { type: "error"; error: Error };

export type PyodideReadyMessage = { type: "ready" };

export type PyodideResultsMessage = {
  type: "results";
  error?: string;
  result?: string;
  stdout: string;
  stderr: string;
};

export type PyodideWorkerMessage =
  | PyodideReadyMessage
  | PyodideResultsMessage
  | PyodideErrorMessage;

export type ExecutePythonOptions = {
  signal?: AbortSignal;
};

export type PythonExecutionResult<T = unknown> = {
  output?: T;
  error?: string;
  stdout?: string;
  stderr?: string;
};
