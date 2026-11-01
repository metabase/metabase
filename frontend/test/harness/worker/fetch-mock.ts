// fetch-mock is one copy for the whole worker, while under jest each spec file
// has its own. Its routes and call history are cleared at the same points as
// under jest, and a little stricter where node:test's scheduling differs.
import { createRequire } from "node:module";

import type { CallLog, FetchMock } from "fetch-mock";

/**
 * Where the current test is. "between" lasts from one test's cleanup to the
 * next test's start.
 */
type TestPhase =
  | "init"
  | "beforeEach"
  | "body"
  | "afterBody"
  | "afterEach"
  | "between";
const PHASES_AFTER_BODY = new Set<TestPhase>([
  "afterBody",
  "afterEach",
  "between",
]);
type MarkedCallLog = CallLog & { arrivedAfterBody?: boolean };

const require = createRequire(import.meta.url);

let fetchMock: FetchMock | null = null;
let phase: TestPhase = "init";

export function setTestPhase(next: TestPhase): void {
  phase = next;
}

/**
 * The unmatched-route check in a setup file's afterEach reads the call
 * history. A request that was still in flight when the body finished can
 * reach fetch on either side of that check, by a few microtasks, and jest's
 * own overhead happens to put it after. Here the rule is explicit: an
 * unmatched call that reaches fetch after the body has finished is not this
 * test's call.
 */
export function ignoreUnmatchedCallsAfterBody(): void {
  const history = loadFetchMock().callHistory;
  const recordCall = history.recordCall.bind(history);
  history.recordCall = (callLog: MarkedCallLog) => {
    callLog.arrivedAfterBody = PHASES_AFTER_BODY.has(phase);
    recordCall(callLog);
  };
  const calls = history.calls.bind(history);
  history.calls = (...args: Parameters<typeof calls>) =>
    calls(...args).filter(
      (callLog: MarkedCallLog) => callLog.route || !callLog.arrivedAfterBody,
    );
}

/**
 * Work that outlives a test keeps fetching in the gap before the next test
 * starts, where the routes are already gone. Those calls belong to the test
 * that started them, which has had its own check already.
 */
export function clearCallHistory(): void {
  loadFetchMock().callHistory.clear();
}

/**
 * node:test puts more turns of the event loop between two tests than jest
 * does. A request that the previous test's cleanup scheduled lands in that
 * gap, before this test has any route, and is recorded as unmatched. It is
 * not this test's request.
 */
export function dropUnmatchedCalls(): void {
  const history = loadFetchMock().callHistory;
  if (history.callLogs.some((callLog) => !callLog.route)) {
    history.callLogs = history.callLogs.filter((callLog) => callLog.route);
  }
}

/**
 * jest's own afterEach clears the routes, but it flushes first, and a
 * throwing flush would leave them for the next test to collide with.
 */
export function removeRoutes(): void {
  const mock = loadFetchMock();
  mock.removeRoutes();
  mock.callHistory.clear();
}

export async function flushAndRemoveRoutes(): Promise<void> {
  try {
    await loadFetchMock().callHistory.flush(true);
  } catch {
    // A request that fails while it settles has failed its test already.
  }
  removeRoutes();
}

function loadFetchMock(): FetchMock {
  if (fetchMock) {
    return fetchMock;
  }
  const { default: loaded }: { default: FetchMock } = require("fetch-mock");
  fetchMock = loaded;
  return loaded;
}
