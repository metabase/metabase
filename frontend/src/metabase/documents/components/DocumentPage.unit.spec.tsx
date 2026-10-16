import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCommentEndpoints,
  setupDocumentEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { PRODUCT_ANALYTICS_DOCUMENT_ATTR } from "metabase-types/api";
import { createMockDocument } from "metabase-types/api/mocks";

import { DocumentPage } from "./DocumentPage";

const setup = () => {
  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(
    createMockDocument({
      name: "Ends with whitespace ",
      id: 1,
      can_write: true,
    }),
  );
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupTimelinesEndpoints([]);

  renderWithProviders(
    <>
      <Route path="/document/:entityId" element={<DocumentPage />}></Route>
    </>,
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

const setupAnalysisDocument = () => {
  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(
    createMockDocument({
      id: 1,
      can_write: true,
      document: {
        type: "doc",
        attrs: {
          [PRODUCT_ANALYTICS_DOCUMENT_ATTR]: {
            version: 1,
            table_id: 42,
            date_range: "past30days",
          },
        },
        content: [{ type: "productAnalysis", attrs: { _id: "a" } }],
      },
    }),
  );
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupTimelinesEndpoints([]);

  renderWithProviders(
    <>
      <Route path="/document/:entityId" element={<DocumentPage />} />
      <Route
        path="/event-analysis/document/:id"
        element={<div>Analysis document</div>}
      />
    </>,
    {
      withRouter: true,
      initialRoute: "/document/1",
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

  it("sends analysis documents to the page that can edit them", async () => {
    setupAnalysisDocument();

    expect(await screen.findByText("Analysis document")).toBeInTheDocument();
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
});
