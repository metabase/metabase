/// <reference lib="webworker" />

// The pyodide package is not made for use on the web, so we
// cannot use it directly. Instead we import it for it's type definitions.
// eslint-disable-next-line import/namespace
import type * as Pyodide from "pyodide";

import type {
  PyodideWorkerCommand,
  PyodideWorkerMessage,
  PythonLibraries,
} from "./types";

const PACKAGES = ["pandas", "numpy"];

let pyodide: Pyodide.PyodideAPI | null = null;

self.addEventListener("unhandledrejection", (event) => {
  event.stopPropagation();
  send({ type: "error", error: event.reason });
  terminate();
});

self.addEventListener(
  "message",
  ({ data }: MessageEvent<PyodideWorkerCommand>) => {
    switch (data.type) {
      case "init":
        return init();
      case "terminate":
        return terminate();
      case "execute":
        return execute(data);
    }
  },
);

/**
 * Send a message to the main thread.
 */
function send(message: PyodideWorkerMessage) {
  self.postMessage(message);
}

function terminate() {
  send({ type: "terminated" });
  self.close();
}

async function init() {
  // // Import pyodide from local assets
  self.importScripts("/app/assets/pyodide/pyodide.js");

  // @ts-expect-error: loadPyodide is put in the global scope by pyodide.js
  const loader = loadPyodide as typeof Pyodide.loadPyodide;

  pyodide = await loader({
    indexURL: "/app/assets/pyodide/",
    packages: PACKAGES,
  });

  // import the packages on initialization since that is slow
  await pyodide.runPythonAsync(
    PACKAGES.map((pkg) => `import ${pkg}`).join("\n"),
  );

  // Add helper function that grabs the last exception
  // and formats it as a string
  await pyodide.runPythonAsync(
    `
def __format_exception():
  import sys
  from traceback import format_exception
  return "".join(
    format_exception(sys.last_type, sys.last_value, sys.last_traceback)
  )
    `,
  );

  // Signal that worker is ready to accept messages
  send({ type: "ready" });
}

async function execute({
  code,
  libraries,
}: {
  code: string;
  libraries: PythonLibraries;
}) {
  const result = await executePython(code, libraries);
  send({ type: "results", ...result });
}

async function executePython(code: string, libraries: PythonLibraries) {
  if (!pyodide) {
    throw new Error("Pyodide not initialized");
  }

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
    pyodide.FS.writeFile(name, library);
  }

  try {
    const result = await pyodide.runPythonAsync(code);
    return {
      result: serialize(result),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (_err) {
    const formatException = pyodide.globals.get(
      "__format_exception",
    ) as () => string;
    const error = formatException();
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
