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
  // Import pyodide from local assets
  self.importScripts("/app/assets/pyodide/pyodide.js");

  // @ts-expect-error: loadPyodide is put in the global scope by pyodide.js
  const loader = loadPyodide as typeof Pyodide.loadPyodide;

  pyodide = await loader({
    indexURL: "/app/assets/pyodide/",
    packages: PACKAGES,
  });

  // Import the packages on initialization since that is slow
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

  // Disallow importing certain modules to prevent security issues
  await pyodide.runPythonAsync(`
import sys
import builtins

def __override():
  # Banned modules for security - comprehensive list to prevent sandbox escapes

  # JavaScript bridge and Pyodide internals:
  # - "js": Prevent access to JavaScript bridge to avoid DOM manipulation and XSS
  # - "pyodide": Prevent Pyodide API manipulation to avoid sandbox escape
  # - "_pyodide_core": Prevent low-level Pyodide internals access
  # - "micropip": CRITICAL - prevents dynamic package installation that bypasses restrictions

  # Network access modules (prevent data exfiltration and SSRF):
  # - "http": HTTP client modules
  # - "urllib": Standard library HTTP/URL handling (works in Pyodide via Fetch API)
  # - "urllib3": Third-party HTTP library (supported in Pyodide 2.2.0+)
  # - "requests": Popular HTTP library (can work with pyodide-http)
  # - "socket": Low-level network interface
  # - "ssl": SSL/TLS wrapper for socket objects
  # - "pyodide.http": Pyodide-specific HTTP module using browser APIs
  # - "aiohttp": Async HTTP client/server library
  # - "fsspec": Filesystem abstraction that can access remote storage

  # File system and process access:
  # - "pathlib": File system path operations
  # - "os": Environment and process manipulation
  # - "subprocess": Process execution
  # - "io": File I/O operations (open files for reading/writing)
  # - "tempfile": Create temporary files
  # - "shutil": High-level file operations

  # Import system manipulation (prevent bypassing restrictions):
  # - "importlib": Dynamic import system that can bypass string-based checks
  # - "imp": Deprecated import internals (removed in Python 3.12 but may exist in older Pyodide)

  # Code execution and introspection (prevent dynamic code evaluation):
  # - "code": Interactive interpreter and code execution
  # - "codeop": Utilities to compile code
  # - "inspect": Runtime introspection to access internals
  # - "types": Dynamic type and function creation
  # - "gc": Garbage collector access to find hidden objects
  # - "ctypes": Foreign function interface to call C code
  # - "ast": Abstract syntax tree manipulation

  banned_modules = [
    # JavaScript and Pyodide internals
    "js",
    "pyodide",
    "_pyodide_core",
    "micropip",
    # Network access
    "http",
    "urllib",
    "urllib.request",
    "urllib.error",
    "urllib.parse",
    "urllib.robotparser",
    "urllib3",
    "requests",
    "socket",
    "ssl",
    "pyodide.http",
    "aiohttp",
    "fsspec",
    # File system and processes
    "pathlib",
    "os",
    "subprocess",
    "io",
    "tempfile",
    "shutil",
    # Import system
    "importlib",
    "imp",
    # Code execution and introspection
    "code",
    "codeop",
    "inspect",
    "types",
    "gc",
    "ctypes",
    "ast",
  ]

  # Banned built-in functions that allow code execution or system access
  dangerous_builtins = [
    "open",
  ]

  real_import = builtins.__import__

  def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    # Check both the module name and any parent modules
    module_parts = name.split(".")
    for i in range(len(module_parts)):
      partial_name = ".".join(module_parts[:i+1])
      if partial_name in banned_modules:
        raise ImportError(f"Access to the {partial_name} module is disabled for security reasons.")
    return real_import(name, globals, locals, fromlist, level)

  # Override the default import builtin to block importing of banned modules
  builtins.__import__ = restricted_import

  # Remove dangerous built-in functions
  for func_name in dangerous_builtins:
    if func_name in dir(builtins):
      # Replace with a function that raises an error
      def make_restricted_func(name):
        def restricted_func(*args, **kwargs):
          raise RuntimeError(f"The {name} function is disabled for security reasons.")
        return restricted_func
      setattr(builtins, func_name, make_restricted_func(func_name))

  # Remove the imported modules from sys.modules if they were imported during
  # initialization to ensure they cannot be accessed even if previously loaded
  for name in list(sys.modules.keys()):
    for banned in banned_modules:
      if name == banned or name.startswith(banned + "."):
        sys.modules.pop(name, None)
        break

__override()
  `);

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

  const logs: string[] = [];
  pyodide.setStdout({
    batched(out: string) {
      logs.push(out);
    },
  });

  pyodide.setStderr({
    batched(out: string) {
      logs.push(out);
    },
  });

  for (const [name, library] of Object.entries(libraries)) {
    pyodide.FS.writeFile(name, library);
  }

  try {
    const result = await pyodide.runPythonAsync(code);
    return {
      result: serialize(result),
      logs: logs.join("\n"),
    };
  } catch (pythonExecutionError) {
    console.error("Python execution error:", pythonExecutionError);

    const formatException = pyodide.globals.get(
      "__format_exception",
    ) as () => string;
    const error = formatException();
    return {
      error: { message: serialize(error) },
      logs: logs.join("\n"),
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
