import {
  setupDocumentEndpoints,
  setupDocumentRevisionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Revision } from "metabase-types/api";
import {
  createMockDocument,
  createMockRevision,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DocumentHistoryPage } from "./DocumentHistoryPage";

const DOCUMENT = createMockDocument({
  id: 10,
  name: "Quarterly review",
  collection: DOCUMENTS_COLLECTION,
});

const OTHER_USER = {
  id: 2,
  first_name: "Ada",
  last_name: "Lovelace",
  common_name: "Ada Lovelace",
};

type SetupOpts = {
  revisions?: Revision[];
};

function setup({ revisions = [] }: SetupOpts = {}) {
  setupDocumentEndpoints(DOCUMENT);
  setupDocumentRevisionsEndpoint(DOCUMENT.id, revisions);
  setupLibraryCollectionEndpoints();

  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId/history"
      element={<DocumentHistoryPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/documents/${DOCUMENT.id}/history`,
      storeInitialState: createMockState({
        currentUser: createMockUser({ id: 1 }),
      }),
    },
  );
}

describe("DocumentHistoryPage", () => {
  it("describes each revision of the document", async () => {
    setup({
      revisions: [
        createMockRevision({
          id: 3,
          is_creation: false,
          description: "edited the content.",
          diff: {
            before: { document: { type: "doc" } },
            after: { document: { type: "doc", content: [] } },
          },
          user: OTHER_USER,
        }),
        createMockRevision({
          id: 2,
          is_creation: false,
          is_reversion: true,
          description: "reverted to an earlier version.",
          user: OTHER_USER,
        }),
        createMockRevision({ id: 1, is_creation: true }),
      ],
    });

    expect(await screen.findByText("edited the content.")).toBeInTheDocument();
    expect(
      screen.getByText("reverted to a previous version"),
    ).toBeInTheDocument();
    expect(screen.getByText("created this document")).toBeInTheDocument();
    expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("words trash and restore like the rest of the timeline", async () => {
    setup({
      revisions: [
        createMockRevision({
          id: 3,
          is_creation: false,
          description: "untrashed this Document.",
          diff: {
            before: { archived: true, archived_directly: true },
            after: { archived: false, archived_directly: false },
          },
        }),
        createMockRevision({
          id: 2,
          is_creation: false,
          description: "trashed this Document.",
          diff: {
            before: { archived: false, archived_directly: false },
            after: { archived: true, archived_directly: true },
          },
        }),
        createMockRevision({ id: 1, is_creation: true }),
      ],
    });

    expect(
      await screen.findByText("restored this document from the trash"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("moved this document to the trash"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/this Document\./)).not.toBeInTheDocument();
  });

  it("does not render the raw content diff", async () => {
    setup({
      revisions: [
        createMockRevision({
          id: 2,
          is_creation: false,
          description: "edited the content.",
          diff: {
            before: { document: { type: "doc" } },
            after: { document: { type: "doc", content: [] } },
          },
        }),
      ],
    });

    expect(await screen.findByText("edited the content.")).toBeInTheDocument();
    expect(screen.queryByText("before")).not.toBeInTheDocument();
    expect(screen.queryByText("after")).not.toBeInTheDocument();
  });

  it("says when the document has no history", async () => {
    setup();

    expect(
      await screen.findByText("No revision history available."),
    ).toBeInTheDocument();
  });
});
