/// <reference lib="webworker" />

// Pyodide does not come with type definitions, so we have to add them
// here as best we can.
type Pyodide = {
  setStdout(options: { batched: (out: string) => void }): void;
  setStderr(options: { batched: (out: string) => void }): void;
  runPythonAsync(code: string): Promise<any>;
  globals: {
    get<T>(name: string): T;
  };
  FS: {
    writeFile(
      name: string,
      content: string,
      options: { encoding: string },
    ): void;
  };
};

const PACKAGES = ["pandas", "numpy"];

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
      const result = await execute(pyodide, data.code, data.libraries);
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
  const pyodide: Pyodide = await loadPyodide({
    indexURL: "/app/assets/pyodide/",
    packages: PACKAGES,
  });

  // import the packages on initialization since that is slow
  await pyodide.runPythonAsync(
    PACKAGES.map((pkg) => `import ${pkg}`).join("\n"),
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

async function execute(
  pyodide: Pyodide,
  code: string,
  libraries: Record<string, string> = {},
) {
  const stdout: string[] = [];
  pyodide.setStdout({
    batched(out: string) {
      stdout.push(out);
    },
  });

  const stderr: string[] = [];
  pyodide.setStderr({
    batched(out: string) {
      stderr.push(out);
    },
  });

  for (const [name, library] of Object.entries(libraries)) {
    pyodide.FS.writeFile(name, library, { encoding: "utf8" });
  }

  try {
    const result = await pyodide.runPythonAsync(code);
    return {
      result: serialize(result),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (_err) {
    const error = pyodide.globals.get<() => string>("__format_exception")();
    return {
      error: serialize(error),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  }
}

// Deep serialization function to handle nested complex objects
function serialize(obj: unknown) {
  if (
    typeof obj === "object" &&
    obj !== null &&
    "toJs" in obj &&
    typeof obj.toJs === "function"
  ) {
    return JSON.parse(JSON.stringify(obj.toJs({ create_pyproxies: false })));
  }
  return obj;
}
