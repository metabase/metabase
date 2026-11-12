// The shapes that travel between a worker, the pool and the reporters.

/**
 * The exit code of a worker that stops on purpose, so that the pool starts a
 * fresh one for the remaining files.
 */
export const RECYCLE_EXIT_CODE = 75;

/**
 * A test as jest names it: the titles of its describe blocks and its own.
 */
export type TestIdentity = {
  ancestors: string[];
  title: string;
  /**
   * The place of the test in the order in which its file reported its tests.
   */
  order?: number;
  /**
   * How long the test ran, for a test that ran.
   */
  durationMs?: number;
};

/**
 * A place in a source file as written, before the transform.
 */
export type SourceFrame = {
  file: string;
  line: number;
  column: number;
};

export type TestFailure = {
  /**
   * The full name for display, with " > " between the titles.
   */
  test: string;
  /**
   * Absent when the file itself failed, for example when it did not load.
   */
  identity?: TestIdentity;
  message: string;
  stack: string;
  /**
   * The frames of the stack that are in the project's own code, innermost
   * first.
   */
  frames: SourceFrame[];
  /**
   * What the test wrote to the console.
   */
  output: string;
};

export type SnapshotSummary = {
  added: number;
  matched: number;
  unmatched: number;
  updated: number;
  unchecked: number;
  uncheckedKeys: string[];
  fileDeleted: boolean;
};

export type FileResult = {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  passedTests: TestIdentity[];
  skippedTests: TestIdentity[];
  todoTests: TestIdentity[];
  failures: TestFailure[];
  /**
   * Errors of afterAll hooks. jest reports them as a failure of the file, and
   * keeps the results of its tests.
   */
  suiteErrors: TestFailure[];
  /**
   * Absent when the file did not get as far as its snapshots.
   */
  snapshot?: SnapshotSummary;
};

/**
 * What the jest runner puts in a failed test's failureDetails, so that a jest
 * reporter can show the test's console output.
 */
export type ConsoleOutputDetail = {
  consoleOutput: string;
};

export type FileStarted = {
  file: string;
};

export type FileDone = {
  file: string;
  durationMs: number;
  result: FileResult;
};

export type MessageToWorker = { type: "run"; file: string } | { type: "stop" };

export type MessageFromWorker =
  | { type: "ready" }
  | { type: "finished"; result: FileResult };
