/// <reference lib="webworker" />

// We'll use 'any' for pyodide since we're loading it via importScripts
let pyodide = null;

// Message types for worker communication
// Send response back to main thread
function sendResponse(response) {
  self.postMessage(response);
}

// Initialize Pyodide
async function initPyodide() {
  try {
    sendResponse({ type: "log", id: "init", data: "Loading Pyodide in Web Worker..." });

    // Import pyodide from local assets
    self.importScripts("/app/assets/pyodide/pyodide.js");

    // @ts-ignore - loadPyodide is available after importScripts
    pyodide = await loadPyodide({
      indexURL: "/app/assets/pyodide/",
    });

    sendResponse({ type: "log", id: "init", data: "Pyodide loaded successfully" });

    // Load essential packages
    await pyodide.loadPackage(["micropip", "numpy", "pandas"]);
    sendResponse({ type: "log", id: "init", data: "Essential packages loaded" });

    return true;
  } catch (error) {
    console.error("Failed to initialize Pyodide:", error);
    throw error;
  }
}

// Deep serialization function to handle nested complex objects
function deepSerialize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle PyProxy objects first (from Pyodide)
  if (obj.toJs && typeof obj.toJs === 'function') {
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

// Execute Python code
async function executePython(code, context = {}) {
  if (!pyodide) {
    throw new Error("Pyodide not initialized");
  }

  // Set up context variables
  for (const [key, value] of Object.entries(context)) {
    pyodide.globals.set(key, value);
  }

  // Capture output
  await pyodide.runPythonAsync(`
import sys
import io
_stdout = io.StringIO()
_stderr = io.StringIO()
_original_stdout = sys.stdout
_original_stderr = sys.stderr
sys.stdout = _stdout
sys.stderr = _stderr
  `);

  let result;
  let error = null;

  try {
    // Execute the code
    console.log('About to execute Python code:', code);
    result = await pyodide.runPythonAsync(code);
    console.log('Python execution result:', result);
    console.log('Result type:', typeof result);
    console.log('Result is null/undefined:', result === null || result === undefined);
  } catch (err) {
    console.error('Python execution error:', err);
    error = err;
  }

  // Get captured output
  const stdout = await pyodide.runPythonAsync(`
sys.stdout = _original_stdout
sys.stderr = _original_stderr
_stdout.getvalue()
  `);

  const stderr = await pyodide.runPythonAsync(`_stderr.getvalue()`);

  console.log('Captured stdout:', stdout);
  console.log('Captured stderr:', stderr);

  if (error) {
    throw error;
  }

  // Convert result to JSON-serializable format
  let serializedResult;
  try {
    console.log('Raw result type:', typeof result);
    console.log('Raw result constructor:', result?.constructor?.name);
    console.log('Raw result:', result);

    // Always use deep serialization for objects
    if (result && typeof result === 'object') {
      serializedResult = deepSerialize(result);
    } else {
      serializedResult = result;
    }

    // Final safety check - try to JSON stringify to test serializability
    JSON.stringify(serializedResult);
    console.log('Serialization successful');
  } catch (e) {
    console.error('Serialization failed:', e);
    // If serialization fails, convert to string representation
    try {
      serializedResult = JSON.parse(JSON.stringify(result, (key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        if (value instanceof Set) {
          return Array.from(value);
        }
        if (value && typeof value === 'object' && value.toJs) {
          return value.toJs();
        }
        return value;
      }));
    } catch (e2) {
      serializedResult = String(result);
    }
  }

  const finalResult = {
    result: serializedResult,
    stdout: stdout,
    stderr: stderr,
  };

  console.log('Final result being returned:', finalResult);
  return finalResult;
}

// Load additional packages
async function loadPackages(packages) {
  if (!pyodide) {
    throw new Error("Pyodide not initialized");
  }

  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
import micropip
for pkg in ${JSON.stringify(packages)}:
    await micropip.install(pkg)
  `);
}

// Handle messages from main thread
self.addEventListener("message", async (event) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case "init":
        await initPyodide();
        sendResponse({ type: "success", id, data: "Pyodide initialized" });
        break;

      case "execute":
        const result = await executePython(data.code, data.context);
        sendResponse({ type: "success", id, data: result });
        break;

      case "loadPackages":
        await loadPackages(data.packages);
        sendResponse({ type: "success", id, data: "Packages loaded" });
        break;

      default:
        sendResponse({ type: "error", id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    let errorMessage;
    try {
      if (error && typeof error === 'object' && error.toJs) {
        // Convert PyProxy error to JavaScript object
        errorMessage = error.toJs();
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
    } catch (e) {
      errorMessage = String(error);
    }

    sendResponse({
      type: "error",
      id,
      error: errorMessage
    });
  }
});

// Signal that worker is ready
sendResponse({ type: "log", id: "ready", data: "Worker ready" });