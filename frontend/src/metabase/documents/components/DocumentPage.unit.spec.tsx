import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCommentEndpoints,
  setupDocumentEndpoints,
  setupDocumentErrorEndpoint,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DocumentContent } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { DocumentPage } from "./DocumentPage";

registerVisualizations();

const CARD = createMockCard({ id: 42, name: "Orders", display: "table" });

const PARAGRAPH_CONTENT: DocumentContent["content"] = [
  {
    type: "paragraph",
    attrs: { _id: "1" },
    content: [{ type: "text", text: "Original content" }],
  },
];

const CARD_EMBED_CONTENT: DocumentContent["content"] = [
  {
    type: "resizeNode",
    attrs: { height: 400, minHeight: 280 },
    content: [
      {
        type: "cardEmbed",
        attrs: { id: CARD.id, name: null, _id: "2" },
      },
    ],
  },
];

interface SetupOpts {
  canWrite?: boolean;
  withCardEmbed?: boolean;
}

const setup = ({ canWrite = true, withCardEmbed = false }: SetupOpts = {}) => {
  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(
    createMockDocument({
      name: "Ends with whitespace ",
      id: 1,
      can_write: canWrite,
      document: createMockDocumentContent({
        content: withCardEmbed
          ? [...PARAGRAPH_CONTENT, ...CARD_EMBED_CONTENT]
          : PARAGRAPH_CONTENT,
      }),
    }),
  );
  if (withCardEmbed) {
    setupCardEndpoints(CARD);
    setupCardQueryMetadataEndpoint(CARD, createMockCardQueryMetadata());
    setupCardQueryEndpoints(CARD, createMockDataset());
  }
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupTimelinesEndpoints([]);

  return renderWithProviders(
    <>
      <Route path="/document/:entityId" element={<DocumentPage />}></Route>
    </>,
    {
      withRouter: true,
      initialRoute: "/document/1",
    },
  );
};

const setupDocumentError = ({ status }: { status: number }) => {
  setupBookmarksEndpoints([]);
  setupDocumentErrorEndpoint(1, { status });
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupTimelinesEndpoints([]);

  return renderWithProviders(
    <Route path="/document/:entityId" element={<DocumentPage />} />,
    {
      withRouter: true,
      initialRoute: "/document/1",
    },
  );
};

const setupNewDocument = () => {
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);

  return renderWithProviders(
    <Route path="/document/:entityId" element={<DocumentPage />} />,
    {
      withRouter: true,
      initialRoute: "/document/new",
    },
  );
};

const getDocumentTitle = async () =>
  await screen.findByRole("textbox", { name: /document title/i });

describe("Document Page", () => {
  it("should show a save button when title changes", async () => {
    setup();
    await waitFor(async () =>
      expect(await getDocumentTitle()).toHaveValue("Ends with whitespace "),
    );

    await userEvent.clear(await getDocumentTitle());
    await userEvent.type(await getDocumentTitle(), "New Title");

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument();

    // Change the title back to the old value, the save button should disappear.
    // I don't love how this test works, but asserting that something doesn't exist
    // is a very easy way to get false positives in your test. Asserting that something
    // doesn't exist *anymore* should be more robust
    await userEvent.clear(await getDocumentTitle());
    await userEvent.type(await getDocumentTitle(), "Ends with whitespace ");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("warns about unsaved changes only once a navigation lands back on /document/new", async () => {
    const { router } = setupNewDocument();

    await userEvent.type(await getDocumentTitle(), "Draft");

    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();

    // The "New document" menu item links to the URL we are already on, which v7
    // resolves as a replace. The page stays mounted, so the fresh location is
    // what tells it the user asked to start over.
    act(() => router?.navigate("/document/new", { replace: true }));

    expect(await screen.findByTestId("leave-confirmation")).toBeInTheDocument();
  });

  it("renders a read-only editor without the save button when the user cannot write the document", async () => {
    setup({ canWrite: false });

    const documentContent = await screen.findByTestId("document-content");
    expect(
      await within(documentContent).findByText("Original content"),
    ).toBeInTheDocument();
    expect(within(documentContent).getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("renders an editable editor when the user can write the document", async () => {
    setup({ canWrite: true });

    const documentContent = await screen.findByTestId("document-content");
    expect(
      await within(documentContent).findByText("Original content"),
    ).toBeInTheDocument();
    expect(within(documentContent).getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  it("shows the permission error page when the user has no access to the document", async () => {
    const { store } = setupDocumentError({ status: 403 });

    await waitFor(() =>
      expect(store.getState().app.errorPage).toMatchObject({ status: 403 }),
    );
  });

  it("only enables 'Download results' in the card menu when the user cannot write the document", async () => {
    setup({ canWrite: false, withCardEmbed: true });

    const card = await screen.findByTestId("document-card-embed");
    expect(
      await within(card).findByTestId("card-embed-title"),
    ).toHaveTextContent("Orders");

    await userEvent.click(
      await within(card).findByRole("button", { name: /ellipsis/ }),
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Download results" }),
    ).toBeEnabled();
    [/Edit Query/, /Edit Visualization/, /Replace/, /Remove Chart/].forEach(
      (name) => {
        expect(within(menu).getByRole("menuitem", { name })).toBeDisabled();
      },
    );
  });
});
