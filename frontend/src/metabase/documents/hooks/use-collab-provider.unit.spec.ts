import { act, renderHook } from "@testing-library/react";

jest.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: jest
    .fn()
    .mockImplementation(() => ({ destroy: jest.fn() })),
}));

jest.mock("yjs", () => ({
  Doc: jest.fn().mockImplementation(() => ({ destroy: jest.fn() })),
}));

// eslint-disable-next-line import/order
import { HocuspocusProvider } from "@hocuspocus/provider";
// eslint-disable-next-line import/order
import * as Y from "yjs";

import { useCollabProvider } from "./use-collab-provider";

const MockedProvider = HocuspocusProvider as unknown as jest.Mock;
const MockedDoc = Y.Doc as unknown as jest.Mock;

function lastProviderInstance() {
  return MockedProvider.mock.results.at(-1)?.value as { destroy: jest.Mock };
}

function lastDocInstance() {
  return MockedDoc.mock.results.at(-1)?.value as { destroy: jest.Mock };
}

describe("useCollabProvider", () => {
  beforeEach(() => {
    MockedProvider.mockClear();
    MockedDoc.mockClear();
  });

  it("returns null and constructs nothing when canWrite is false", () => {
    const { result } = renderHook(() => useCollabProvider("abc", false));
    expect(result.current).toBeNull();
    expect(MockedProvider).not.toHaveBeenCalled();
    expect(MockedDoc).not.toHaveBeenCalled();
  });

  it("returns null when entity-id is missing", () => {
    const { result } = renderHook(() => useCollabProvider(null, true));
    expect(result.current).toBeNull();
    expect(MockedProvider).not.toHaveBeenCalled();
  });

  it("constructs a session and passes the expected options", () => {
    const { result } = renderHook(() => useCollabProvider("doc-123", true));
    expect(result.current).not.toBeNull();
    expect(MockedProvider).toHaveBeenCalledTimes(1);
    const opts = MockedProvider.mock.calls[0][0];
    expect(opts.name).toBe("document:doc-123");
    expect(String(opts.url)).toMatch(/\/api\/document\/collab$/);
    expect(opts.document).toBe(result.current?.ydoc);
  });

  it("destroys provider and ydoc on unmount", () => {
    const { unmount } = renderHook(() => useCollabProvider("doc-123", true));
    const provider = lastProviderInstance();
    const doc = lastDocInstance();
    unmount();
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the session when entity-id changes", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useCollabProvider(id, true),
      { initialProps: { id: "doc-a" } },
    );
    const firstProvider = lastProviderInstance();
    const firstDoc = lastDocInstance();
    expect(MockedProvider).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ id: "doc-b" });
    });

    expect(firstProvider.destroy).toHaveBeenCalledTimes(1);
    expect(firstDoc.destroy).toHaveBeenCalledTimes(1);
    expect(MockedProvider).toHaveBeenCalledTimes(2);
    expect(MockedProvider.mock.calls[1][0].name).toBe("document:doc-b");
  });
});
