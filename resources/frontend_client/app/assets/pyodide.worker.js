/// <reference lib="webworker" />

const PACKAGES = ["micropip", "numpy", "pandas"];

run();

async function run() {
  const pyodide = await init();

  self.addEventListener("message", async function (event) {
    const { type, data } = event.data;

    if (type === "execute") {
      const result = await execute(pyodide, data.code, data.context);
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

async function execute(pyodide, code, context = {}) {
  pyodide.globals.clear();

  // Set up context variables
  for (const [key, value] of Object.entries(context)) {
    pyodide.globals.set(key, value);
  }

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
      result: deepSerialize(result),
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
// TODO: can we remove this?
function deepSerialize(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Handle PyProxy objects first (from Pyodide)
  if (obj.toJs && typeof obj.toJs === "function") {
    try {
      return deepSerialize(obj.toJs());
    } catch (e) {
      return String(obj);
    }
  }

  // Handle Map objects
  if (obj instanceof Map) {
    try {
      const entries = {};
      for (const [key, value] of obj) {
        entries[String(key)] = deepSerialize(value);
      }
      return entries;
    } catch (e) {
      return Object.fromEntries(obj);
    }
  }

  // Handle Set objects
  if (obj instanceof Set) {
    return Array.from(obj, deepSerialize);
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(deepSerialize);
  }

  // Handle plain objects and other object types
  try {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        result[key] = deepSerialize(value);
      } catch (e) {
        result[key] = String(value);
      }
    }
    return result;
  } catch (e) {
    // If we can't enumerate properties, convert to string
    return String(obj);
  }
}
