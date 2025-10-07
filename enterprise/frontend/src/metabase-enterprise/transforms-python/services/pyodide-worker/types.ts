export type PythonLibraries = Record<string, string>;

export type PyodideWorkerCommand =
  | PyodideInitCommand
  | PyodideExecuteCommand
  | PyodideTerminateCommand;

type PyodideInitCommand = { type: "init" };

type PyodideExecuteCommand = {
  type: "execute";
  code: string;
  libraries: PythonLibraries;
};

type PyodideTerminateCommand = { type: "terminate" };

type PyodideErrorMessage = { type: "error"; error: Error };

type PyodideReadyMessage = { type: "ready" };

type PyodideTerminatedMessage = { type: "terminated" };

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
  | PyodideErrorMessage
  | PyodideTerminatedMessage;

export type ExecutePythonOptions = {
  signal?: AbortSignal;
};

export type PythonExecutionResult<T = unknown> = {
  output?: T;
  error?: string;
  stdout?: string;
  stderr?: string;
};
