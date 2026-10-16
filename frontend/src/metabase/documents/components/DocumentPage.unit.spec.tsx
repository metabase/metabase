import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCommentEndpoints,
  setupDocumentCardsEndpoint,
  setupDocumentEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDocument } from "metabase-types/api/mocks";

import { DocumentPage } from "./DocumentPage";

const setup = () => {
  const document = createMockDocument({
    name: "Ends with whitespace ",
    id: 1,
    can_write: true,
  });
  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(document);
  setupCommentEndpoints([], { target_type: "document", target_id: 1 });
  setupDocumentCardsEndpoint(document, { cards: [] });
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

const getDocumentTitle = async () =>
  await screen.findByRole("textbox", { name: /document title/i });

describe("Document Page", () => {
  it("asks before moving the document to the trash", async () => {
    setup();
    await waitFor(async () =>
      expect(await getDocumentTitle()).toHaveValue("Ends with whitespace "),
    );

    await userEvent.click(screen.getByLabelText("More options"));
    await userEvent.click(screen.getByText("Move to trash"));

    expect(
      await screen.findByRole("dialog", {
        name: "Move this document to trash?",
      }),
    ).toBeInTheDocument();
  });

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
});
