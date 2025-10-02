/// <reference lib="webworker" />

const PACKAGES = ["micropip", "numpy", "pandas"];

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

  // @ts-ignore - loadPyodide is available after importScripts
  return loadPyodide({
    indexURL: "/app/assets/pyodide/",
    packages: PACKAGES,
  });
}

async function execute(pyodide, code) {
  let stdout = "";
  pyodide.setStdout({
    batched(out) {
      stdout += out;
    },
  });

  let stderr = "";
  pyodide.setStderr({
    batched(out) {
      stderr += out;
    },
  });

  try {
    const result = await pyodide.runPythonAsync(code);
    return {
      result: serialize(result),
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      error,
      stdout,
      stderr,
    };
  }
}

// Deep serialization function to handle nested complex objects
function serialize(obj) {
  return JSON.parse(JSON.stringify(obj.toJs({ create_pyproxies: false })));
}
