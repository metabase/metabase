/// <reference lib="webworker" />

const url = new URL(self.location.href);
const packages = url.searchParams.getAll("packages");

self.addEventListener("unhandledrejection", (event) => {
  event.stopPropagation();
  self.postMessage({ type: "error", error: event.reason });
});

run();

async function run() {
  const pyodide = await init();

  self.addEventListener("message", async function (event) {
    const { type, data } = event.data;

    if (type === "execute") {
      const result = await execute(pyodide, data.code);
      self.postMessage({ type: "results", ...result });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  });

  // Signal that worker is ready to accept messages
  self.postMessage({ type: "ready" });
}

async function init() {
  // Import pyodide from local assets
  self.importScripts("/app/assets/pyodide/pyodide.js");

  // @ts-expect-error - loadPyodide is available after importScripts
  // eslint-disable-next-line no-undef
  const pyodide = await loadPyodide({
    indexURL: "/app/assets/pyodide/",
    packages,
  });

  // import the packages on initialization since that is slow
  await pyodide.runPythonAsync(
    packages.map((pkg) => `import ${pkg}`).join("\n"),
  );

  // Add helper function that grabs the last exception
  // and formats it as a string
  pyodide.runPythonAsync(
    `
def __format_exception():
  import sys
  from traceback import format_exception
  return "".join(
    format_exception(sys.last_type, sys.last_value, sys.last_traceback)
  )
    `,
  );

  return pyodide;
}

async function execute(pyodide, code) {
  const stdout = [];
  pyodide.setStdout({
    batched(out) {
      stdout.push(out);
    },
  });

  const stderr = [];
  pyodide.setStderr({
    batched(out) {
      stderr.push(out);
    },
  });

  try {
    const result = await pyodide.runPythonAsync(code);
    return {
      result: serialize(result),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (_err) {
    const error = pyodide.globals.get("__format_exception")();
    return {
      error: serialize(error),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  }
}

// Deep serialization function to handle nested complex objects
function serialize(obj) {
  if (obj.toJs) {
    return JSON.parse(JSON.stringify(obj.toJs({ create_pyproxies: false })));
  }
  return obj;
}
