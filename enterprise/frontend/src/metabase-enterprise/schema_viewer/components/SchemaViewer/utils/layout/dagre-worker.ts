import { getDagrePositions } from "./dagre-layout";
import type { DagreWorkerRequest, DagreWorkerResponse } from "./types";

self.onmessage = (event: MessageEvent<DagreWorkerRequest>) => {
  const { generation, graph } = event.data;
  try {
    self.postMessage({
      type: "success",
      generation,
      positions: getDagrePositions(graph),
    } satisfies DagreWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      generation,
      message: error instanceof Error ? error.message : String(error),
    } satisfies DagreWorkerResponse);
  }
};
