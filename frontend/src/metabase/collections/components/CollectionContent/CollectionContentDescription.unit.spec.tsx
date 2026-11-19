import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const MARKDOWN_DESCRIPTION = "[link](https://metabase.com)";

const describedCollection = createMockCollection({
  id: 2,
  name: "Described collection",
  description: MARKDOWN_DESCRIPTION,
  can_write: true,
});

const childCollection = createMockCollectionItem({
  id: 3,
  name: "Child collection",
  model: "collection",
  description: MARKDOWN_DESCRIPTION,
});

function setup() {
  let storedCollection: Collection = describedCollection;
  fetchMock.get(
    `path:/api/collection/${describedCollection.id}`,
    () => storedCollection,
    { name: "get-described-collection" },
  );
  fetchMock.put(
    `path:/api/collection/${describedCollection.id}`,
    async (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      storedCollection = {
        ...storedCollection,
        ...(typeof body === "object" ? body : {}),
      };
      return storedCollection;
    },
    { name: "update-described-collection" },
  );
  setupCollectionsEndpoints({ collections: [describedCollection] });
  setupCollectionItemsEndpoint({
    collection: describedCollection,
    collectionItems: [childCollection],
  });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={describedCollection.id} />}
    />,
    { withRouter: true, withDND: true },
  );
}

/** The caption renders a markdown description as a link inside its editable text */
function getCaptionDescription() {
  return within(screen.getByTestId("collection-caption"))
    .getByRole("link", { name: "link" })
    .closest("[data-testid='editable-text']");
}

async function openInfoSidesheet() {
  await userEvent.click(screen.getByRole("button", { name: "More info" }));
  return screen.findByRole("dialog", { name: "Info" });
}

describe("CollectionContent description", () => {
  it("renders the markdown description in the caption, and shows a description edited in the info sidesheet in both places", async () => {
    setup();

    const caption = within(await screen.findByTestId("collection-caption"));
    expect(caption.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://metabase.com",
    );
    expect(getCaptionDescription()).toHaveTextContent(/^link$/);

    const sidesheet = within(await openInfoSidesheet());
    await userEvent.click(sidesheet.getByTestId("editable-text"));
    await userEvent.type(sidesheet.getByRole("textbox"), "edited ", {
      initialSelectionStart: 0,
      initialSelectionEnd: 0,
    });
    await userEvent.tab();
    await userEvent.click(sidesheet.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Info" }),
      ).not.toBeInTheDocument();
    });
    const updateCalls = fetchMock.callHistory.calls(
      "update-described-collection",
    );
    expect(updateCalls).toHaveLength(1);
    expect(JSON.parse(String(updateCalls[0].options.body))).toEqual({
      description: `edited ${MARKDOWN_DESCRIPTION}`,
    });
    await waitFor(() => {
      expect(getCaptionDescription()).toHaveTextContent("edited link");
    });

    const reopenedSidesheet = within(await openInfoSidesheet());
    expect(reopenedSidesheet.getByTestId("editable-text")).toHaveTextContent(
      "edited link",
    );
  });
});
