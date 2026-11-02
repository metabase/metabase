import { act, renderHook } from "@testing-library/react";
import { type ReactNode, StrictMode, createElement } from "react";

import * as Layout from "../utils/layout";
import {
  type DagreWorker,
  createDagreWorker,
} from "../utils/layout/dagre-worker-client";
import type {
  DagreWorkerRequest,
  DagreWorkerResponse,
} from "../utils/layout/types";
import { makeFlowNode } from "../utils/test-utils";

import {
  type LayoutOutcome,
  type LayoutReason,
  useGraphLayout,
} from "./useGraphLayout";

jest.mock("../utils/layout/dagre-worker-client");

const mockCreateDagreWorker = jest.mocked(createDagreWorker);

class FakeDagreWorker implements DagreWorker {
  onmessage: ((event: MessageEvent<DagreWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: DagreWorkerRequest[] = [];
  terminated = false;

  postMessage(message: DagreWorkerRequest) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  succeed() {
    const request = this.messages.at(-1)!;
    this.onmessage?.(
      new MessageEvent<DagreWorkerResponse>("message", {
        data: {
          type: "success",
          generation: request.generation,
          positions: request.graph.nodes.map(({ id }, index) => ({
            id,
            x: index * 500,
            y: index * 200,
          })),
        },
      }),
    );
  }

  fail(error: Error) {
    this.onerror?.(new ErrorEvent("error", { error, message: error.message }));
  }
}

function freshLayout(id = 1): Layout.LayoutRequest {
  return {
    mode: "fresh",
    nodes: [makeFlowNode({ id, fieldCount: 2 })],
    edges: [],
  };
}

function startRequest(
  methods: ReturnType<typeof useGraphLayout>,
  request: Layout.LayoutRequest,
  reason: LayoutReason = "auto-layout",
): Promise<LayoutOutcome> {
  let pending!: Promise<LayoutOutcome>;
  act(() => {
    pending = methods.requestLayout(request, reason);
  });
  return pending;
}

function getSuccessfulResult(outcome: LayoutOutcome | undefined) {
  if (outcome?.status !== "success") {
    throw new Error(`Expected success, received ${outcome?.status}`);
  }
  return outcome.result;
}

describe("useGraphLayout", () => {
  let workers: FakeDagreWorker[];

  beforeEach(() => {
    workers = [];
    mockCreateDagreWorker.mockReset();
    mockCreateDagreWorker.mockImplementation(() => {
      const worker = new FakeDagreWorker();
      workers.push(worker);
      return worker;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("cancels the previous request when a newer request starts", async () => {
    const { result } = renderHook(() => useGraphLayout());
    const first = startRequest(result.current, freshLayout(1));
    expect(result.current.pendingReason).toBe("auto-layout");

    const second = startRequest(result.current, freshLayout(2), "focus-node");

    await expect(first).resolves.toEqual({ status: "cancelled" });
    expect(workers[0].terminated).toBe(true);
    expect(result.current.pendingReason).toBe("focus-node");

    let secondOutcome: LayoutOutcome | undefined;
    await act(async () => {
      workers[1].succeed();
      secondOutcome = await second;
    });
    expect(secondOutcome?.status).toBe("success");
    expect(result.current.pendingReason).toBeNull();
  });

  it("ignores stale worker messages and only accepts the latest generation", async () => {
    const { result } = renderHook(() => useGraphLayout());
    const first = startRequest(result.current, freshLayout(1));
    const staleWorker = workers[0];
    const second = startRequest(result.current, freshLayout(2));
    await expect(first).resolves.toEqual({ status: "cancelled" });

    staleWorker.succeed();
    expect(result.current.pendingReason).toBe("auto-layout");

    let outcome: LayoutOutcome | undefined;
    await act(async () => {
      workers[1].succeed();
      outcome = await second;
    });
    expect(outcome).toMatchObject({ status: "success" });
    expect(getSuccessfulResult(outcome).nodes[0].id).toBe("table-2");
  });

  it("cancelLayout terminates and settles active work without accepting later messages", async () => {
    const { result } = renderHook(() => useGraphLayout());
    const pending = startRequest(result.current, freshLayout());
    const worker = workers[0];

    act(() => result.current.cancelLayout());

    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(worker.terminated).toBe(true);
    worker.succeed();
    expect(result.current.pendingReason).toBeNull();
  });

  it("terminates and settles active work on unmount", async () => {
    const { result, unmount } = renderHook(() => useGraphLayout());
    const pending = startRequest(result.current, freshLayout());
    const worker = workers[0];

    unmount();

    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(worker.terminated).toBe(true);
  });

  it("continues updating state after Strict Mode replays its effect", async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result } = renderHook(() => useGraphLayout(), { wrapper });

    const pending = startRequest(result.current, freshLayout());

    expect(result.current.pendingReason).toBe("auto-layout");
    await act(async () => {
      workers.at(-1)!.succeed();
      await pending;
    });
    expect(result.current.pendingReason).toBeNull();
  });

  it("falls back exactly once after worker failure and stops creating workers", async () => {
    const fallback = jest.spyOn(Layout, "completeLayoutSynchronously");
    const { result } = renderHook(() => useGraphLayout());
    const first = startRequest(result.current, freshLayout(1));

    let firstOutcome: LayoutOutcome | undefined;
    await act(async () => {
      workers[0].fail(new Error("worker failed"));
      firstOutcome = await first;
    });

    expect(firstOutcome?.status).toBe("success");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(mockCreateDagreWorker).toHaveBeenCalledTimes(1);

    let secondOutcome: LayoutOutcome | undefined;
    await act(async () => {
      secondOutcome = await result.current.requestLayout(
        freshLayout(2),
        "auto-layout",
      );
    });

    expect(secondOutcome?.status).toBe("success");
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(mockCreateDagreWorker).toHaveBeenCalledTimes(1);
  });

  it("does not run synchronous fallback after worker success", async () => {
    const fallback = jest.spyOn(Layout, "completeLayoutSynchronously");
    const { result } = renderHook(() => useGraphLayout());
    const pending = startRequest(result.current, freshLayout());

    await act(async () => {
      workers[0].succeed();
      await pending;
    });

    expect(fallback).not.toHaveBeenCalled();
  });

  it("reports an error when worker and synchronous fallback both fail", async () => {
    const { result } = renderHook(() => useGraphLayout());
    const pending = startRequest(result.current, {
      mode: "fresh",
      nodes: [makeFlowNode({ id: 1, fieldCount: 2 })],
      edges: [{ source: "table-1", target: "table-unknown" }],
    });

    let outcome: LayoutOutcome | undefined;
    await act(async () => {
      workers[0].fail(new Error("worker failed"));
      outcome = await pending;
    });

    expect(outcome?.status).toBe("error");
    expect(result.current.layoutError).toBeInstanceOf(Error);
    expect(result.current.pendingReason).toBeNull();
  });

  it("returns synchronous incremental results without creating a worker", async () => {
    const existing = makeFlowNode({
      id: 1,
      fieldCount: 2,
      position: { x: 100, y: 200 },
      opacity: 1,
    });
    const { result } = renderHook(() => useGraphLayout());

    let outcome: LayoutOutcome | undefined;
    await act(async () => {
      outcome = await result.current.requestLayout(
        {
          mode: "merge",
          incoming: [existing, makeFlowNode({ id: 2, fieldCount: 2 })],
          current: [existing],
          edges: [{ source: "table-1", target: "table-2" }],
        },
        "graph-sync",
      );
    });

    expect(outcome?.status).toBe("success");
    expect(mockCreateDagreWorker).not.toHaveBeenCalled();
    expect(result.current.pendingReason).toBeNull();
  });
});
