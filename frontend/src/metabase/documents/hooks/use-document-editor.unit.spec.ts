import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { act, getTestStoreAndWrapper, waitFor } from "__support__/ui";
import { documentApi } from "metabase/api/document";
import type { Document } from "metabase-types/api";
import {
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { useDocumentEditor } from "./use-document-editor";

const DOCUMENT_ID = 1;
const UPDATE_CACHE_KEY = `document:${DOCUMENT_ID}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setupEndpoints(doc: Document) {
  const put = deferred<Document>();
  let current = doc;
  fetchMock.get(`path:/api/document/${doc.id}`, () => current);
  fetchMock.put(`path:/api/document/${doc.id}`, async () => {
    const saved = await put.promise;
    current = saved;
    return saved;
  });
  return put;
}

function renderEditorHook() {
  const { wrapper, store } = getTestStoreAndWrapper({
    initialRoute: "/",
    withRouter: true,
    withKBar: false,
    withDND: false,
  });

  const { result, unmount } = renderHook(
    () => useDocumentEditor({ documentId: DOCUMENT_ID }),
    { wrapper },
  );

  return { result, unmount, store, wrapper };
}

async function waitForDocument(result: {
  current: { documentData: Document | undefined };
}) {
  await waitFor(() => {
    expect(result.current.documentData?.id).toBe(DOCUMENT_ID);
  });
}

function startUpdate(store: ReturnType<typeof renderEditorHook>["store"]) {
  act(() => {
    store.dispatch(
      documentApi.endpoints.updateDocument.initiate(
        {
          id: DOCUMENT_ID,
          name: "Updated",
          document: createMockDocumentContent(),
        },
        { fixedCacheKey: UPDATE_CACHE_KEY },
      ),
    );
  });
}

describe("useDocumentEditor", () => {
  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });

  it("does not serve a cached document when remounting onto an in-flight update", async () => {
    const stale = createMockDocument({
      id: DOCUMENT_ID,
      name: "Stale",
    });
    const put = setupEndpoints(stale);

    const { result, unmount, store, wrapper } = renderEditorHook();
    await waitForDocument(result);
    expect(result.current.isDocumentLoading).toBe(false);

    startUpdate(store);
    await waitFor(() => {
      expect(result.current.isSaving).toBe(true);
    });
    expect(result.current.documentData?.name).toBe("Stale");
    expect(result.current.isDocumentLoading).toBe(false);

    const getsBeforeRemount = fetchMock.callHistory.calls(
      `path:/api/document/${DOCUMENT_ID}`,
      { method: "GET" },
    ).length;

    unmount();
    const { result: remountResult } = renderHook(
      () => useDocumentEditor({ documentId: DOCUMENT_ID }),
      { wrapper },
    );

    expect(remountResult.current.isDocumentLoading).toBe(true);
    expect(remountResult.current.documentData).toBeUndefined();
    expect(
      fetchMock.callHistory.calls(`path:/api/document/${DOCUMENT_ID}`, {
        method: "GET",
      }),
    ).toHaveLength(getsBeforeRemount);

    act(() => {
      put.resolve({ ...stale, name: "Updated" });
    });

    await waitFor(() => {
      expect(remountResult.current.isDocumentLoading).toBe(false);
    });
    await waitFor(() => {
      expect(remountResult.current.documentData?.name).toBe("Updated");
    });
  });

  it("keeps the loaded document visible while an update runs on the same mount", async () => {
    const doc = createMockDocument({ id: DOCUMENT_ID, name: "Current" });
    setupEndpoints(doc);

    const { result, store } = renderEditorHook();
    await waitForDocument(result);

    startUpdate(store);
    await waitFor(() => {
      expect(result.current.isSaving).toBe(true);
    });

    expect(result.current.isDocumentLoading).toBe(false);
    expect(result.current.documentData?.name).toBe("Current");
  });
});
