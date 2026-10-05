import { renderHook } from "@testing-library/react";
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
    const first = derive([YEAR]);
    const second = derive([CLEAR]);

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
    const failed = derive([YEAR]);
    const next = derive([CLEAR]);

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

    const failed = derive([YEAR]).catch(() => undefined);
    const next = derive([CLEAR]);
    expect(pendingDerivesRef.current).toBe(2);

    await failed;
    expect(pendingDerivesRef.current).toBe(1);

    await next;
    expect(pendingDerivesRef.current).toBe(0);
  });
});
