const PASSED = "passed";
const FAILED = "failed";
const KILL_KINDS = new Set(["assertion", "spec-exception"]);

// A test catches a break when it passes on clean code, fails with an assertion on the break, fails the same way on a rerun and passes on a clean rerun.
// Any other failure is an error, and a failure that hasn't been rerun is unconfirmed.
export function judge({ clean, broken, rerun, cleanRerun }) {
  const out = { ran: [], caught_by: [], errored: [], unconfirmed: [], failures: {} };
  for (const [id, obs] of broken) {
    if (clean.get(id) !== PASSED) {
      continue;
    }
    if (obs.status !== PASSED && obs.status !== FAILED) {
      continue;
    }
    out.ran.push(id);
    if (obs.status === PASSED) {
      continue;
    }
    const again = rerun?.get(id);
    const cleanAgain = cleanRerun?.get(id);
    const put = (bucket, reason) => {
      out[bucket].push(id);
      out.failures[id] = { kind: obs.kind, ...(reason && { reason }), ...(obs.message && { message: obs.message }) };
    };
    if (!KILL_KINDS.has(obs.kind)) {
      put("errored", obs.kind);
    } else if (again?.status === "missing") {
      put("unconfirmed", "rerun didn't finish");
    } else if (again && !(again.status === FAILED && KILL_KINDS.has(again.kind))) {
      put("errored", "not reproduced on rerun");
    } else if (cleanAgain?.status === "missing") {
      put("unconfirmed", "clean rerun didn't finish");
    } else if (cleanAgain && cleanAgain.status !== PASSED) {
      put("errored", "fails on a clean rerun");
    } else if (!again || !cleanAgain) {
      put("unconfirmed", again ? "clean rerun missing" : "not rerun");
    } else {
      put("caught_by");
    }
  }
  return out;
}

const ASSERTION_RE =
  /expect\(|Expected|Received|toHave|toBe|toEqual|toMatch|toContain|Unable to find|TestingLibraryElementError|AssertionError|Snapshot|toThrow|toBeCalled|toHaveBeenCalled|Found multiple elements/;
const SPEC_FILE_RE = /\.(unit\.)?spec\.[jt]sx?$|\/test\/|__support__|\/mocks?\//;
const JEST_PACKAGE_RE = /^(jest|jest-[^/]+|@jest\/[^/]+|expect|babel-jest)$/;
const ANSI_COLOUR_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function frameFile(line) {
  const at = line.replace(/^\s+at /, "").trim();
  const location = at.match(/\(([^()]*)\)$/)?.[1] ?? at;
  if (/<anonymous>|^node:|^native$/.test(location)) {
    return null;
  }
  const file = location.replace(/^file:\/\//, "").replace(/:\d+(:\d+)?$/, "");
  if (!/[/\\]|\.[cm]?[jt]sx?$/.test(file)) {
    return null;
  }
  const pkg = file.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
  return pkg && JEST_PACKAGE_RE.test(pkg) ? null : file;
}

export function jestFailureKind(message) {
  const text = (message || "").replace(ANSI_COLOUR_RE, "");
  if (/Exceeded timeout of/.test(text)) {
    return "timeout";
  }
  if (ASSERTION_RE.test(text.split("\n").slice(0, 6).join("\n"))) {
    return "assertion";
  }
  const file = text
    .split("\n")
    .filter((l) => /^\s+at /.test(l))
    .map(frameFile)
    .find(Boolean);
  return file && SPEC_FILE_RE.test(file) ? "spec-exception" : "product-exception";
}

export function jestObservation(t) {
  if (!t) {
    return { status: "missing" };
  }
  if (t.status !== FAILED) {
    return { status: t.status };
  }
  return { status: FAILED, kind: jestFailureKind(t.message), message: (t.message ?? "").slice(0, 600) };
}

export function deftestObservation(t) {
  if (!t) {
    return { status: "missing" };
  }
  if (t.status === "failure") {
    return { status: FAILED, kind: "assertion", message: t.message };
  }
  if (t.status === "error") {
    return { status: FAILED, kind: "exception", message: t.message };
  }
  return { status: t.status };
}

export function observed(ids, observations, observe) {
  return new Map(ids.map((id) => [id, observe(observations.get(id))]));
}
