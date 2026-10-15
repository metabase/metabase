// Parts of Node that the runner uses and that the installed @types/node does
// not describe, because they are newer than those types.

// A module of its own, so the declarations below extend Node's types.
export {};

declare module "perf_hooks" {
  interface PerformanceObserver {
    takeRecords(): PerformanceEntry[];
  }
}

declare global {
  namespace NodeJS {
    interface Process {
      getBuiltinModule(id: string): unknown;
    }
  }
}
