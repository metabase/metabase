import fetchMock from "fetch-mock";

import {
  setupDocumentEndpoints,
  setupDocumentNotFoundEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { Document } from "metabase-types/api";
import { createMockDocument } from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  DOCUMENTS_FOLDER,
  SHARED_COLLECTION,
  TRASHED_FOLDER,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DocumentPageShell } from "./DocumentPageShell";

const DOCUMENT_ID = 10;

type SetupOpts = {
  document?: Partial<Document>;
  documentError?: "not-found" | "server-error";
  initialRoute?: string;
};

function setup({
  document: documentOpts,
  documentError,
  initialRoute = `/data-studio/documents/${DOCUMENT_ID}`,
}: SetupOpts = {}) {
  const document = createMockDocument({
    id: DOCUMENT_ID,
    name: "Quarterly review",
    collection_id: DOCUMENTS_FOLDER.id,
    collection: DOCUMENTS_FOLDER,
    ...documentOpts,
  });
  if (documentError === "not-found") {
    setupDocumentNotFoundEndpoint(document);
  } else if (documentError === "server-error") {
    fetchMock.get(`path:/api/document/${DOCUMENT_ID}`, 500);
  } else {
    setupDocumentEndpoints(document);
  }
  setupLibraryCollectionEndpoints([
    DOCUMENTS_FOLDER,
    SHARED_COLLECTION,
    TRASHED_FOLDER,
  ]);

  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId"
      element={
        <DocumentPageShell data-testid="document-page">
          {(document) => <div>{`Page of ${document.name}`}</div>}
        </DocumentPageShell>
      }
    />,
    { withRouter: true, initialRoute },
  );
}

function getBreadcrumbLinks() {
  const header = screen.getByTestId("document-pane-header");
  return within(within(header).getByTestId("data-studio-breadcrumbs"))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

describe("DocumentPageShell", () => {
  it("shows a loader, then the page with the folders leading to the document", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Page of Quarterly review")).toBeInTheDocument();
    expect(getBreadcrumbLinks()).toEqual([
      ["Documents", "/data-studio/documents"],
      ["Sales", `/data-studio/documents?expandedId=${DOCUMENTS_FOLDER.id}`],
    ]);
  });

  it("links a trashed folder to its collection page, where it can be restored", async () => {
    setup({
      document: {
        archived: true,
        archived_directly: false,
        collection_id: TRASHED_FOLDER.id,
        collection: TRASHED_FOLDER,
      },
    });

    await waitForLoaderToBeRemoved();
    expect(getBreadcrumbLinks()).toEqual([
      ["Documents", "/data-studio/documents"],
      ["Old reports", `/collection/${TRASHED_FOLDER.id}-old-reports`],
    ]);
    expect(
      fetchMock.callHistory.called(
        `path:/api/collection/${DOCUMENTS_COLLECTION.id}`,
      ),
    ).toBe(true);
  });

  it("says a document in the root collection is not in the Library and opens it", async () => {
    setup({ document: { collection_id: null, collection: null } });

    await waitForLoaderToBeRemoved();
    expect(
      screen.getByText("This document isn't in the Library"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It's saved in Our analytics."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/document/${DOCUMENT_ID}`,
    );
    expect(
      screen.queryByTestId("document-pane-header"),
    ).not.toBeInTheDocument();
  });

  it("names the collection of a document outside the Library", async () => {
    setup({
      document: {
        collection_id: SHARED_COLLECTION.id,
        collection: SHARED_COLLECTION,
      },
    });

    await waitForLoaderToBeRemoved();
    expect(screen.getByText("It's saved in Shared.")).toBeInTheDocument();
  });

  it("offers the way back to Documents when the document does not exist", async () => {
    setup({ documentError: "not-found" });

    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Document not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Documents" }),
    ).toHaveAttribute("href", "/data-studio/documents");
  });

  it("treats a route without a document id as not found", async () => {
    setup({ initialRoute: "/data-studio/documents/not-a-document" });

    expect(await screen.findByText("Document not found")).toBeInTheDocument();
  });

  it("shows the error when the document fails to load", async () => {
    setup({ documentError: "server-error" });

    await waitForLoaderToBeRemoved();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByTestId("document-page")).not.toBeInTheDocument();
  });
});
