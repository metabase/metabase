import { CliError } from "./validation.js";

interface AgentCljs {
  evaluate: (
    code: string,
    databaseId: number,
    metadata: unknown,
  ) => unknown;
}

let _module: AgentCljs | null = null;

/**
 * Dynamically import the compiled CLJS module.
 * Uses ESM import() since both the agent-toolkit and the CLJS output are ESM.
 */
export async function loadCljsModule(): Promise<AgentCljs> {
  if (_module) return _module;

  try {
    // Dynamic import of the ESM CLJS module
    const mod = await import("../../lib/cljs/agent.js");
    _module = mod as AgentCljs;
    return _module;
  } catch (e) {
    throw new CliError("cljs_not_built", {
      message:
        "CLJS module not found. Run 'bun run build:cljs' in the agent-toolkit directory first.",
      hint: "The MBQL query builder requires the ClojureScript module to be compiled.",
    });
  }
}
