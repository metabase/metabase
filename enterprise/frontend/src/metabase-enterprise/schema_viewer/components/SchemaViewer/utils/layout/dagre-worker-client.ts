import type { DagreWorkerRequest, DagreWorkerResponse } from "./types";

export type DagreWorker = {
  onmessage: ((event: MessageEvent<DagreWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: DagreWorkerRequest) => void;
  terminate: () => void;
};

export function createDagreWorker(): DagreWorker {
  return new Worker(new URL("./dagre-worker.ts", import.meta.url), {
    name: "schema-viewer-layout",
  });
}
