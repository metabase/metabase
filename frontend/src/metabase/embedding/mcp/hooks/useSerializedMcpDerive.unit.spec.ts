import { renderHook, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  getCurrentMcpQueryHandle,
  setCurrentMcpQueryHandle,
} from "../requests";

import { useSerializedMcpDerive } from "./useSerializedMcpDerive";

const INSTANCE_URL = "http://localhost:3000";
const deriveUrl = (handle: string) =>
  `${INSTANCE_URL}/api/embed-mcp/queries/${handle}/derive`;

const YEAR = { type: "temporal-bucket/set", unit: "year" } as const;
const CLEAR = { type: "date-filter/clear" } as const;
const APPLY = () => {};

function setup() {
  const { result } = renderHook(() =>
    useSerializedMcpDerive({
      instanceUrl: INSTANCE_URL,
      uiCredential: "credential-1",
      mcpSessionId: "session-1",
    }),
  );

  return result.current;
}

const derivedHandles = () =>
  fetchMock.callHistory
    .calls()
    .map((call) => call.url.match(/queries\/([^/]+)\/derive/)?.[1]);

describe("useSerializedMcpDerive", () => {
  beforeEach(() => {
    setCurrentMcpQueryHandle("handle-1");
  });

  afterEach(() => {
    setCurrentMcpQueryHandle(null);
  });

  it("derives each change from the handle the previous change produced", async () => {
    // The first response is slow, so without serialization the second change would
    // start from the same handle and its faster response would be overwritten.
    fetchMock.post(
      deriveUrl("handle-1"),
      { handle: "handle-2", query: "q2" },
      { delay: 100 },
    );
    fetchMock.post(deriveUrl("handle-2"), { handle: "handle-3", query: "q3" });

    const { deriveQuery: derive } = setup();
    const first = derive([YEAR], APPLY);
    const second = derive([CLEAR], APPLY);

    await expect(first).resolves.toEqual({ handle: "handle-2", query: "q2" });
    await expect(second).resolves.toEqual({ handle: "handle-3", query: "q3" });

    expect(derivedHandles()).toEqual(["handle-1", "handle-2"]);
    expect(getCurrentMcpQueryHandle()).toBe("handle-3");
  });

  it("starts the next change from the last good handle when a change fails", async () => {
    let calls = 0;
    fetchMock.post(deriveUrl("handle-1"), () =>
      ++calls === 1 ? 400 : { handle: "handle-2", query: "q2" },
    );

    const { deriveQuery: derive } = setup();
    const failed = derive([YEAR], APPLY);
    const next = derive([CLEAR], APPLY);

    await expect(failed).rejects.toMatchObject({ status: 400 });
    await expect(next).resolves.toEqual({ handle: "handle-2", query: "q2" });

    expect(derivedHandles()).toEqual(["handle-1", "handle-1"]);
    expect(getCurrentMcpQueryHandle()).toBe("handle-2");
  });

  it("counts the derives still pending, failed ones included", async () => {
    let calls = 0;
    fetchMock.post(
      deriveUrl("handle-1"),
      () => (++calls === 1 ? 400 : { handle: "handle-2", query: "q2" }),
      { delay: 50 },
    );

    const { deriveQuery: derive, pendingDerivesRef } = setup();
    expect(pendingDerivesRef.current).toBe(0);

    const failed = derive([YEAR], APPLY).catch(() => undefined);
    const next = derive([CLEAR], APPLY);
    expect(pendingDerivesRef.current).toBe(2);

    await failed;
    expect(pendingDerivesRef.current).toBe(1);

    await next;
    expect(pendingDerivesRef.current).toBe(0);
  });

  it("makes the derived handle current while applying it, and restores the old one when applying fails", async () => {
    fetchMock.post(deriveUrl("handle-1"), { handle: "handle-2", query: "q2" });

    const { deriveQuery: derive } = setup();
    const handleWhileApplying: Array<string | null> = [];
    const failingApply = () => {
      handleWhileApplying.push(getCurrentMcpQueryHandle());
      throw new Error("The derived query could not be read.");
    };

    await expect(derive([YEAR], failingApply)).rejects.toThrow(
      "could not be read",
    );

    expect(handleWhileApplying).toEqual(["handle-2"]);
    expect(getCurrentMcpQueryHandle()).toBe("handle-1");
  });

  it("drops a derive whose base handle was replaced while it was in flight", async () => {
    fetchMock.post(
      deriveUrl("handle-1"),
      { handle: "handle-2", query: "q2" },
      { delay: 500 },
    );

    const { deriveQuery: derive } = setup();
    const apply = jest.fn();
    const derived = derive([YEAR], apply);

    // A new tool result loads while the derive is in flight.
    await waitFor(() => {
      expect(fetchMock.callHistory.calls()).toHaveLength(1);
    });
    setCurrentMcpQueryHandle("tool-result-handle");

    await expect(derived).rejects.toMatchObject({ isStale: true });
    expect(apply).not.toHaveBeenCalled();
    expect(getCurrentMcpQueryHandle()).toBe("tool-result-handle");
  });
});
