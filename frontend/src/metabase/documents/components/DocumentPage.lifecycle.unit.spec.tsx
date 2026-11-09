import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupCommentEndpoints,
  setupCopyDocumentEndpoint,
  setupCreateBookmarkEndpoint,
  setupCreateDocumentEndpoint,
  setupDocumentErrorEndpoint,
  setupEntityRevisionsEndpoint,
  setupLibraryEndpoints,
  setupNotFoundCardEndpoints,
  setupPersistentDocumentEndpoints,
  setupRecentViewsEndpoints,
  setupRevertRevisionErrorEndpoint,
  setupRevertableRevisionsEndpoints,
  setupTimelinesEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { SimpleEventSchema } from "metabase-types/analytics";
import type { Document, DocumentContent, Revision } from "metabase-types/api";
import {
  createMockCollection,
  createMockDocument,
  createMockDocumentContent,
  createMockRevision,
  createMockUser,
} from "metabase-types/api/mocks";

import { DocumentPageOuter } from "../routes";

// metabase/analytics is auto-mocked globally, and only an analytics.ts file
// may import the tracker by name.
const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock<void, [SimpleEventSchema]>;
}>("metabase/analytics");

const DOCUMENT_ID = 1;
const ORIGINAL_TEXT = "Original content";

const PARAGRAPH_CONTENT: DocumentContent["content"] = [
  {
    type: "paragraph",
    attrs: { _id: "1" },
    content: [{ type: "text", text: ORIGINAL_TEXT }],
  },
];

const CURRENT_USER = createMockUser({ id: 1 });

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  can_write: true,
});

const createDocument = (opts?: Partial<Document>) =>
  createMockDocument({
    id: DOCUMENT_ID,
    name: "Test Document",
    can_write: true,
    collection_id: null,
    document: createMockDocumentContent({ content: PARAGRAPH_CONTENT }),
    ...opts,
  });

interface SetupOpts {
  initialRoute?: string;
  documents?: Document[];
}

const setup = ({
  initialRoute = `/document/${DOCUMENT_ID}`,
  documents = [createDocument()],
}: SetupOpts = {}) => {
  setupLibraryEndpoints();
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupUsersEndpoints([CURRENT_USER]);
  setupRecentViewsEndpoints([]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: ROOT_COLLECTION,
  });
  setupCollectionByIdEndpoint({ collections: [ROOT_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [],
  });
  const updateStoredDocument = new Map(
    documents.map((document) => {
      setupCommentEndpoints([], {
        target_type: "document",
        target_id: document.id,
      });
      return [document.id, setupPersistentDocumentEndpoints(document)];
    }),
  );

  const view = renderWithProviders(
    <Route path="/document/:entityId" element={<DocumentPageOuter />} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: CURRENT_USER }),
    },
  );

  return { ...view, updateStoredDocument };
};

const findTitleInput = () =>
  screen.findByRole("textbox", { name: "Document Title" });

const findDocumentContent = () => screen.findByTestId("document-content");

const findEditor = async () =>
  within(await findDocumentContent()).findByRole("textbox");

// Synchronous queries for use inside `waitFor` callbacks
const getTitleInput = () =>
  screen.getByRole("textbox", { name: "Document Title" });

const getDocumentContent = () => screen.getByTestId("document-content");

const getEditor = () => within(getDocumentContent()).getByRole("textbox");

// Where the caret lands in jsdom is not reliable, so assertions only check
// that the typed text is present
const typeInEditor = async (text: string) => {
  await userEvent.type(await findEditor(), text);
};

const waitForContent = async (text: string | RegExp) => {
  await waitFor(() => expect(getDocumentContent()).toHaveTextContent(text));
};

const openMoreOptions = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "More options" }),
  );
};

const clickMenuItem = async (name: string | RegExp) => {
  await userEvent.click(await screen.findByRole("menuitem", { name }));
};

const getLastRequestBody = (path: string, method: "POST" | "PUT"): unknown => {
  const call = fetchMock.callHistory.lastCall(`path:${path}`, { method });
  return JSON.parse(String(call?.options.body));
};

const getToasts = (store: ReturnType<typeof setup>["store"]) =>
  store.getState().undo;

const pressUndo = () => userEvent.keyboard("{Control>}z{/Control}");
const pressRedo = () =>
  userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

const expectSaveButton = async () =>
  expect(
    await screen.findByRole("button", { name: "Save" }),
  ).toBeInTheDocument();

const expectNoSaveButton = () =>
  expect(
    screen.queryByRole("button", { name: "Save" }),
  ).not.toBeInTheDocument();

describe("DocumentPage lifecycle", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  describe("duplicating", () => {
    const COPY = createDocument({ id: 2, name: "Saved title - Duplicate" });

    it("warns about unsaved changes, keeps them on cancel, and saves, copies and redirects on confirm", async () => {
      setupCopyDocumentEndpoint(DOCUMENT_ID, COPY);
      setup({ documents: [createDocument(), COPY] });

      const titleInput = await findTitleInput();
      await waitFor(() => expect(titleInput).toHaveValue("Test Document"));
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Saved title");
      await waitForContent(ORIGINAL_TEXT);
      await typeInEditor("Changed");
      await expectSaveButton();

      await openMoreOptions();
      await clickMenuItem(/Duplicate/);
      expect(
        await screen.findByTestId("save-confirmation"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(
          screen.queryByTestId("save-confirmation"),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("heading", { name: /Duplicate "/ }),
      ).not.toBeInTheDocument();
      await expectSaveButton();
      expect(
        fetchMock.callHistory.calls(`path:/api/document/${DOCUMENT_ID}`, {
          method: "PUT",
        }),
      ).toHaveLength(0);

      await openMoreOptions();
      await clickMenuItem(/Duplicate/);
      await userEvent.click(
        await screen.findByRole("button", { name: "Save changes" }),
      );

      expect(
        await screen.findByRole("heading", { name: 'Duplicate "Saved title"' }),
      ).toBeInTheDocument();
      expect(
        getLastRequestBody(`/api/document/${DOCUMENT_ID}`, "PUT"),
      ).toMatchObject({ name: "Saved title" });
      expect(
        JSON.stringify(
          getLastRequestBody(`/api/document/${DOCUMENT_ID}`, "PUT"),
        ),
      ).toContain("Changed");
      expectNoSaveButton();
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
        "Saved title - Duplicate",
      );

      await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() =>
        expect(getTitleInput()).toHaveValue("Saved title - Duplicate"),
      );
      expect(
        getLastRequestBody(`/api/document/${DOCUMENT_ID}/copy`, "POST"),
      ).toMatchObject({ name: "Saved title - Duplicate" });
    });

    it("opens the duplicate modal directly when there are no changes", async () => {
      setupCopyDocumentEndpoint(DOCUMENT_ID, COPY);
      const { router } = setup({ documents: [createDocument(), COPY] });

      await waitFor(() => expect(getTitleInput()).toHaveValue("Test Document"));
      expectNoSaveButton();

      await openMoreOptions();
      await clickMenuItem(/Duplicate/);

      expect(
        await screen.findByRole("heading", {
          name: 'Duplicate "Test Document"',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("save-confirmation")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() =>
        expect(router?.location.pathname).toMatch(/^\/document\/2(-|$)/),
      );
      expect(
        getLastRequestBody(`/api/document/${DOCUMENT_ID}/copy`, "POST"),
      ).toMatchObject({ name: "Test Document - Duplicate" });
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "document_duplicated",
        target_id: COPY.id,
      });
    });
  });

  describe("creating", () => {
    const CREATED = createDocument({ name: "Test Document" });

    it("creates a document in the selectable default collection without reloading it (metabase#73538)", async () => {
      setupCreateDocumentEndpoint(CREATED);
      const { router, store } = setup({
        initialRoute: "/document/new",
        documents: [CREATED],
      });

      await waitFor(() => expect(document.title).toMatch(/^New document/));
      const titleInput = await findTitleInput();
      expect(titleInput).toHaveFocus();
      await userEvent.type(titleInput, "Test Document");
      await typeInEditor("This is a paragraph");

      await userEvent.click(
        await screen.findByRole("button", { name: "Save" }),
      );
      expect(
        await screen.findByText("Where should we save this document?"),
      ).toBeInTheDocument();
      const selectButton = await screen.findByTestId(
        "entity-picker-select-button",
      );
      await waitFor(() => expect(selectButton).toBeEnabled());
      await userEvent.click(selectButton);

      await waitFor(() =>
        expect(router?.location.pathname).toMatch(/^\/document\/1(-|$)/),
      );
      const body = getLastRequestBody("/api/document", "POST");
      expect(body).toMatchObject({ name: "Test Document" });
      expect(body).not.toHaveProperty("collection_id");
      expect(JSON.stringify(body)).toContain("This is a paragraph");
      await waitFor(() => expect(document.title).toMatch(/^Test Document/));
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "document_created",
        target_id: CREATED.id,
      });
      expect(getToasts(store)).toMatchObject([{ message: "Document created" }]);
      // the created document is shown without a loading state in between
      expect(
        fetchMock.callHistory.calls(`path:/api/document/${CREATED.id}`, {
          method: "GET",
        }),
      ).toHaveLength(0);
    });

    it("resets the editor when navigating from /new to /new and the changes are discarded", async () => {
      const { router } = setup({
        initialRoute: "/document/new",
        documents: [],
      });

      await findTitleInput();
      expectNoSaveButton();
      await typeInEditor("This is some content");
      await expectSaveButton();

      act(() => router?.navigate("/document/new", { replace: true }));
      const firstWarning = await screen.findByTestId("leave-confirmation");
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: "unsaved_changes_warning_displayed" }),
      );
      await userEvent.click(
        within(firstWarning).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument(),
      );
      expect(await findDocumentContent()).toHaveTextContent(
        /^This is some content$/,
      );

      act(() => router?.navigate("/document/new", { replace: true }));
      const secondWarning = await screen.findByTestId("leave-confirmation");
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
      await userEvent.click(
        within(secondWarning).getByRole("button", { name: "Discard changes" }),
      );

      await waitFor(() => expect(getDocumentContent()).toHaveTextContent(/^$/));
      await waitFor(() => expectNoSaveButton());
    });

    it("focuses the start of the body when Enter is pressed in the title", async () => {
      setup({ initialRoute: "/document/new", documents: [] });

      const titleInput = await findTitleInput();
      expect(titleInput).toHaveFocus();
      await userEvent.keyboard("Doc Title{Enter}");
      await waitFor(() => expect(getEditor()).toHaveFocus());
      await userEvent.keyboard("One{Enter}Two");

      await userEvent.click(titleInput);
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(getEditor()).toHaveFocus());
      await userEvent.keyboard("NEW: ");

      expect(titleInput).toHaveValue("Doc Title");
      expect(await findDocumentContent()).toHaveTextContent(/^NEW: OneTwo$/);
    });
  });

  describe("viewing", () => {
    it("does not allow editing a document in the trash (metabase#63112)", async () => {
      setup({ documents: [createDocument({ archived: true })] });

      await waitForContent(ORIGINAL_TEXT);
      expect(await findTitleInput()).toHaveAttribute("readonly");
      expect(await findEditor()).toHaveAttribute("contenteditable", "false");
    });

    // The page itself is rendered by the app layout, see AppComponent.unit.spec.tsx
    it("reports a nonexistent document as a not found error", async () => {
      setupDocumentErrorEndpoint(9999, { status: 404 });
      const { store } = setup({
        initialRoute: "/document/9999",
        documents: [],
      });

      await waitFor(() =>
        expect(store.getState().app.errorPage).toMatchObject({ status: 404 }),
      );
    });

    it("shows a message for an embedded card that was permanently deleted", async () => {
      const DELETED_CARD_ID = 42;
      setupNotFoundCardEndpoints(DELETED_CARD_ID);
      setup({
        documents: [
          createDocument({
            document: createMockDocumentContent({
              content: [
                ...PARAGRAPH_CONTENT,
                {
                  type: "resizeNode",
                  attrs: { height: 400, minHeight: 280 },
                  content: [
                    {
                      type: "cardEmbed",
                      attrs: { id: DELETED_CARD_ID, name: null, _id: "2" },
                    },
                  ],
                },
              ],
            }),
          }),
        ],
      });

      expect(
        await screen.findByText("Couldn't find this chart."),
      ).toBeInTheDocument();
      expect(screen.getByTestId("document-card-embed")).toHaveTextContent(
        /^Couldn't find this chart\.$/,
      );
    });

    it("prints the document and tracks it", async () => {
      const printSpy = jest.spyOn(window, "print").mockImplementation(() => {});
      setup();

      await waitForContent(ORIGINAL_TEXT);
      await openMoreOptions();
      await clickMenuItem(/Print Document/);

      await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "document_print",
        target_id: DOCUMENT_ID,
      });
      printSpy.mockRestore();
    });

    it("bookmarks the document from the header and tracks it", async () => {
      setupCreateBookmarkEndpoint({ type: "document", item_id: DOCUMENT_ID });
      setup();

      await waitForContent(ORIGINAL_TEXT);
      await openMoreOptions();
      await clickMenuItem(/Bookmark/);

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(
            `path:/api/bookmark/document/${DOCUMENT_ID}`,
            { method: "POST" },
          ),
        ).toHaveLength(1),
      );
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "bookmark_added",
        event_detail: "document",
        triggered_from: "document_header",
      });
    });
  });

  describe("undo history", () => {
    const ORIGINAL = new RegExp(`^${ORIGINAL_TEXT}$`);
    const MODIFIED = /Edit/;

    it("undoes and redoes edits and resets the history on a different document", async () => {
      const { router } = setup();

      await waitForContent(ORIGINAL);
      await userEvent.click(await findEditor());
      await pressUndo();
      await waitForContent(ORIGINAL);

      await typeInEditor("Edit");
      await waitForContent(MODIFIED);
      await pressUndo();
      await waitForContent(ORIGINAL);
      await pressRedo();
      await waitForContent(MODIFIED);
      await pressUndo();
      await waitForContent(ORIGINAL);

      act(() => router?.navigate("/document/new"));
      await waitForContent(/^$/);
      await userEvent.click(await findEditor());
      await pressUndo();
      expect(await findDocumentContent()).toHaveTextContent(/^$/);
    });

    it("keeps the undo history after saving", async () => {
      const { store } = setup();

      await waitForContent(ORIGINAL);
      await typeInEditor("Edit");
      await waitForContent(MODIFIED);

      await userEvent.keyboard("{Control>}s{/Control}");
      await waitFor(() =>
        expect(getToasts(store)).toMatchObject([{ message: "Document saved" }]),
      );
      expectNoSaveButton();

      await pressUndo();
      await waitForContent(ORIGINAL);
    });
  });

  describe("revision history", () => {
    const REVISION_USER = {
      id: CURRENT_USER.id,
      first_name: CURRENT_USER.first_name ?? "",
      last_name: CURRENT_USER.last_name ?? "",
      common_name: CURRENT_USER.common_name ?? "",
    };
    const REVISIONS: Revision[] = [
      createMockRevision({
        id: 2,
        description: 'renamed this Document from "Test Document" to "Updated".',
        timestamp: "2024-01-02T10:00:00Z",
        user: REVISION_USER,
      }),
      createMockRevision({
        id: 1,
        description: "created this.",
        timestamp: "2024-01-01T10:00:00Z",
        is_creation: true,
        user: REVISION_USER,
      }),
    ];

    const openHistory = async () => {
      await waitFor(() => expect(getTitleInput()).toHaveValue("Updated"));
      await openMoreOptions();
      await clickMenuItem(/History/);
      return await screen.findByTestId("document-history-list");
    };

    const revertToCreation = async (historyList: HTMLElement) => {
      await userEvent.click(
        await within(historyList).findByRole("button", {
          name: /revert to .*created this/,
        }),
      );
    };

    it("lists the revisions and reverts the document to one of them", async () => {
      const { updateStoredDocument } = setup({
        documents: [
          createDocument({
            name: "Updated",
            document: createMockDocumentContent({
              content: [
                {
                  type: "paragraph",
                  attrs: { _id: "1" },
                  content: [{ type: "text", text: "Updated content" }],
                },
              ],
            }),
          }),
        ],
      });
      setupRevertableRevisionsEndpoints({
        entity: "document",
        id: DOCUMENT_ID,
        revisions: REVISIONS,
        revertRevision: createMockRevision({
          id: 3,
          description: "reverted to an earlier version.",
          timestamp: "2024-01-03T10:00:00Z",
          is_reversion: true,
          user: REVISION_USER,
        }),
        onRevert: () =>
          updateStoredDocument.get(DOCUMENT_ID)?.({
            name: "Test Document",
            document: createMockDocumentContent({
              content: PARAGRAPH_CONTENT,
            }),
          }),
      });

      const historyList = await openHistory();
      await waitForContent(/^Updated content$/);
      expect(
        await within(historyList).findByText(/renamed this Document/),
      ).toBeInTheDocument();

      await revertToCreation(historyList);

      await waitFor(() => expect(getTitleInput()).toHaveValue("Test Document"));
      await waitForContent(new RegExp(`^${ORIGINAL_TEXT}$`));
      expect(
        await within(screen.getByTestId("document-history-list")).findByText(
          /reverted to an earlier version/,
        ),
      ).toBeInTheDocument();
      expect(getLastRequestBody("/api/revision/revert", "POST")).toEqual({
        entity: "document",
        id: DOCUMENT_ID,
        revision_id: 1,
      });
    });

    it("shows the server error when reverting fails", async () => {
      setupEntityRevisionsEndpoint("document", DOCUMENT_ID, REVISIONS);
      setupRevertRevisionErrorEndpoint({
        message: "Cannot revert: missing document",
      });
      const { store } = setup({
        documents: [createDocument({ name: "Updated" })],
      });

      await revertToCreation(await openHistory());

      await waitFor(() =>
        expect(getToasts(store)).toMatchObject([
          { message: "Cannot revert: missing document", variant: "negative" },
        ]),
      );
      expect(await findTitleInput()).toHaveValue("Updated");
    });
  });
});
