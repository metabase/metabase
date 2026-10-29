import { renderHook } from "@testing-library/react";
import { Editor, Node } from "@tiptap/core";
import TiptapDocument from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import fetchMock from "fetch-mock";

import { setupCreateDocumentEndpoint } from "__support__/server-mocks";
import { act, getTestStoreAndWrapper, waitFor } from "__support__/ui";
import { documentApi } from "metabase/api/document";
import { buildDraftCard } from "metabase/rich_text_editing/tiptap/extensions/shared/draft-card";
import type {
  Card,
  CardParameterMapping,
  Document,
  DocumentId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { createDraftCard } from "../documents.slice";

import { useDocumentEditor } from "./use-document-editor";

const DOCUMENT_ID = 1;
const UPDATE_CACHE_KEY = `document:${DOCUMENT_ID}`;

const PARAMETER_MAPPING: CardParameterMapping = {
  parameter_id: "abc123",
  card_id: 10,
  target: ["dimension", ["template-tag", "category"]],
};

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

interface SetupOpts {
  documentId?: DocumentId | "new";
}

function renderEditorHook({ documentId = DOCUMENT_ID }: SetupOpts = {}) {
  const { wrapper, store } = getTestStoreAndWrapper({
    initialRoute: "/",
    withRouter: true,
    withKBar: false,
    withDND: false,
  });

  const { result, unmount } = renderHook(
    () => useDocumentEditor({ documentId }),
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

interface SaveDraftCardsOpts extends SetupOpts {
  draftCards: { draftId: number; originalCard: Card }[];
  embeddedCardId: number;
}

async function saveDraftCards({
  documentId = DOCUMENT_ID,
  draftCards,
  embeddedCardId,
}: SaveDraftCardsOpts): Promise<unknown> {
  const doc = createMockDocument({ id: DOCUMENT_ID });
  setupEndpoints(doc).resolve(doc);
  setupCreateDocumentEndpoint(doc);

  const isNewDocument = documentId === "new";
  const { result, store } = renderEditorHook({ documentId });
  if (!isNewDocument) {
    await waitForDocument(result);
  }

  const CardEmbed = Node.create({
    name: "cardEmbed",
    group: "block",
    addAttributes: () => ({ id: { default: null } }),
    renderHTML: () => ["div"],
  });
  const editor = new Editor({
    extensions: [TiptapDocument, Paragraph, Text, CardEmbed],
    content: {
      type: "doc",
      content: [{ type: "cardEmbed", attrs: { id: embeddedCardId } }],
    },
  });

  act(() => {
    result.current.setEditorInstance(editor);
    draftCards.forEach(({ draftId, originalCard }) => {
      store.dispatch(
        createDraftCard({ originalCard, modifiedData: {}, draftId }),
      );
    });
  });

  await act(() => result.current.handleSave());
  await waitFor(() => {
    expect(result.current.isSaving).toBe(false);
  });

  const saveCall = isNewDocument
    ? fetchMock.callHistory.lastCall("path:/api/document", { method: "POST" })
    : fetchMock.callHistory.lastCall(`path:/api/document/${DOCUMENT_ID}`, {
        method: "PUT",
      });
  return JSON.parse(String(saveCall?.options.body));
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

  it("sends the saved card id as source_card_id when a chart is edited twice", async () => {
    const body = await saveDraftCards({
      draftCards: [
        { draftId: -1, originalCard: createMockCard({ id: 5 }) },
        { draftId: -2, originalCard: createMockCard({ id: -1 }) },
      ],
      embeddedCardId: -2,
    });

    expect(body).toHaveProperty(["cards", "-2", "source_card_id"], 5);
  });

  it("sends only the fields a new card takes when saving a drafted chart", async () => {
    const { name, display, dataset_query, visualization_settings } =
      createMockCard();
    const body = await saveDraftCards({
      draftCards: [
        {
          draftId: -1,
          originalCard: buildDraftCard({
            id: -1,
            name,
            display,
            dataset_query,
            visualization_settings,
          }),
        },
      ],
      embeddedCardId: -1,
    });

    expect(body).toHaveProperty(["cards", "-1"], {
      name,
      display,
      dataset_query,
      visualization_settings,
      description: null,
      result_metadata: [],
      cache_ttl: null,
    });
  });

  it.each<{ path: string; documentId: DocumentId | "new" }>([
    { path: "create", documentId: "new" },
    { path: "update", documentId: DOCUMENT_ID },
  ])(
    "keeps a saved question's parameter mappings on $path",
    async ({ documentId }) => {
      const body = await saveDraftCards({
        documentId,
        draftCards: [
          {
            draftId: -1,
            originalCard: createMockCard({
              id: 5,
              parameter_mappings: [PARAMETER_MAPPING],
            }),
          },
        ],
        embeddedCardId: -1,
      });

      expect(body).toHaveProperty(
        ["cards", "-1", "parameter_mappings"],
        [PARAMETER_MAPPING],
      );
    },
  );

  it("sends a default name and no description when a draft has blank ones", async () => {
    const { display, dataset_query, visualization_settings } = createMockCard();
    const body = await saveDraftCards({
      draftCards: [
        {
          draftId: -1,
          originalCard: buildDraftCard({
            id: -1,
            name: "",
            description: "",
            display,
            dataset_query,
            visualization_settings,
          }),
        },
      ],
      embeddedCardId: -1,
    });

    expect(body).toMatchObject({
      cards: { "-1": { name: "Untitled question", description: null } },
    });
  });

  it("sends a nonblank name and description as written", async () => {
    const name = " Orders ";
    const description = "    SELECT 1";
    const body = await saveDraftCards({
      draftCards: [
        {
          draftId: -1,
          originalCard: createMockCard({ id: 5, name, description }),
        },
      ],
      embeddedCardId: -1,
    });

    expect(body).toMatchObject({ cards: { "-1": { name, description } } });
  });
});
