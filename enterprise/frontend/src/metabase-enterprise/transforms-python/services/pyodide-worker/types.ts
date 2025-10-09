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
  error?: { message: string };
  result?: string;
  logs?: string;
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
  error?: { message: string };
  logs?: string;
};
