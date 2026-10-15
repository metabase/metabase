import { setupDocumentEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { Document } from "metabase-types/api";
import {
  createMockDocument,
  createMockDocumentContent,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  DOCUMENTS_FOLDER,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DocumentOverviewPage } from "./DocumentOverviewPage";

const DOCUMENT_ID = 10;

type SetupOpts = {
  document?: Partial<Document>;
};

function setup({ document: documentOpts }: SetupOpts) {
  const document = createMockDocument({
    id: DOCUMENT_ID,
    name: "Quarterly review",
    collection_id: DOCUMENTS_FOLDER.id,
    collection: DOCUMENTS_FOLDER,
    creator: createMockUser({ first_name: "Ada", last_name: "Lovelace" }),
    document: createMockDocumentContent({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Revenue grew this quarter." }],
        },
      ],
    }),
    ...documentOpts,
  });
  setupDocumentEndpoints(document);
  setupLibraryCollectionEndpoints([DOCUMENTS_FOLDER]);

  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId"
      element={<DocumentOverviewPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/documents/${DOCUMENT_ID}`,
    },
  );
}

describe("DocumentOverviewPage", () => {
  it("shows a loader, then the document name and its folder breadcrumbs", async () => {
    setup({});

    await waitForLoaderToBeRemoved();
    const header = await screen.findByTestId("document-pane-header");
    expect(
      within(header).getByRole("link", { name: "Documents" }),
    ).toHaveAttribute("href", "/data-studio/documents");
    expect(
      await within(header).findByRole("link", { name: "Sales" }),
    ).toHaveAttribute(
      "href",
      `/data-studio/documents?expandedId=${DOCUMENTS_FOLDER.id}`,
    );
    expect(within(header).getAllByText("Quarterly review")).toHaveLength(2);
  });

  it("previews the document content", async () => {
    setup({});

    const preview = await screen.findByTestId("document-preview");
    expect(
      await within(preview).findByText("Revenue grew this quarter."),
    ).toBeInTheDocument();
  });

  it("shows the owner and the view stats in the info panel", async () => {
    setup({
      document: { view_count: 1234, last_viewed_at: "2024-03-01T10:00:00Z" },
    });

    const info = await screen.findByTestId("document-info");
    expect(within(info).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(info).getByText("1,234")).toBeInTheDocument();
    expect(
      within(info).getByText("March 1, 2024, 10:00 AM"),
    ).toBeInTheDocument();
  });

  it("says when the document was never viewed, even though last_viewed_at defaults to its creation time", async () => {
    setup({
      document: { view_count: 0, last_viewed_at: "2024-03-01T10:00:00Z" },
    });

    const info = await screen.findByTestId("document-info");
    expect(within(info).getByText("Never")).toBeInTheDocument();
    expect(
      within(info).queryByText("March 1, 2024, 10:00 AM"),
    ).not.toBeInTheDocument();
  });

  it("links Open to the document editor", async () => {
    setup({});

    expect(await screen.findByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      `/document/${DOCUMENT_ID}`,
    );
  });

  it("does not show the trash banner for a document that is not archived", async () => {
    setup({});

    expect(
      await screen.findByTestId("document-pane-header"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("archive-banner")).not.toBeInTheDocument();
  });
});
