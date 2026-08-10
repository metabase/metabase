import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const defaultCollection = createMockCollection({
  id: 1,
  name: "Selection collection",
  can_write: true,
});

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const pinnedQuestion = createMockCollectionItem({
  id: 2,
  name: "Pinned question",
  model: "card",
  collection_position: 2,
});

const tableQuestion = createMockCollectionItem({
  id: 3,
  name: "Table question",
  model: "card",
  collection_position: null,
});

const tableDashboard = createMockCollectionItem({
  id: 4,
  name: "Table dashboard",
  model: "dashboard",
  collection_position: null,
});

const defaultItems = [
  pinnedDashboard,
  pinnedQuestion,
  tableQuestion,
  tableDashboard,
];

async function setup({
  collection = defaultCollection,
  collectionItems = defaultItems,
}: {
  collection?: Collection;
  collectionItems?: CollectionItem[];
} = {}) {
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionItemsEndpoint({ collection, collectionItems });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={collection.id} />}
    />,
    { withRouter: true, withDND: true },
  );

  await screen.findByTestId("pinned-items");
  await screen.findByText(tableQuestion.name);
}

function getRowSelectionButton(itemName: string) {
  const row = screen.getByRole("row", { name: new RegExp(itemName) });
  const selectionCell = within(row).getByTestId("collection-entry-check");
  return within(selectionCell).getByRole("button");
}

function getPinnedSection() {
  return within(screen.getByTestId("pinned-items"));
}

function getPinnedCard(itemName: string) {
  return getPinnedSection().getByRole("checkbox", { name: itemName });
}

describe("CollectionContent selection", () => {
  it("should render pinned cards as links when nothing is selected", async () => {
    await setup();

    expect(
      getPinnedSection().getByRole("link", { name: pinnedDashboard.name }),
    ).toBeInTheDocument();
    expect(
      getPinnedSection().getByRole("link", { name: pinnedQuestion.name }),
    ).toBeInTheDocument();
    expect(
      getPinnedSection().queryByRole("checkbox", { name: pinnedDashboard.name }),
    ).not.toBeInTheDocument();
  });

  it("should add a pinned card to the same selection as a table row", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
  });

  it("should toggle a selected pinned card off", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    expect(await screen.findByText("2 items selected")).toBeInTheDocument();

    await userEvent.click(getPinnedCard(pinnedDashboard.name));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).not.toBeChecked();
  });

  it("should select pinned cards and table rows with select all", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
    expect(getPinnedCard(pinnedQuestion.name)).toBeChecked();
  });

  it("should select pinned cards and table rows with select all from an empty selection", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
    expect(getPinnedCard(pinnedDashboard.name)).toBeChecked();
    expect(getPinnedCard(pinnedQuestion.name)).toBeChecked();
  });

  it("should base the header checkbox state on table rows only", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getRowSelectionButton(tableDashboard.name));

    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(
      screen.getByLabelText("Select all items"),
    ).not.toBePartiallyChecked();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("should complete select all from a pinned-only selection", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(getPinnedCard(pinnedDashboard.name));
    await userEvent.click(getRowSelectionButton(tableQuestion.name));

    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all items")).toBeChecked();
    expect(screen.getByLabelText("Select all items")).toBePartiallyChecked();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await screen.findByText("4 items selected")).toBeInTheDocument();
  });

  it("should restore pinned card navigation after deselecting all", async () => {
    await setup();

    await userEvent.click(getRowSelectionButton(tableQuestion.name));
    await userEvent.click(screen.getByLabelText("Select all items"));
    expect(await screen.findByText("4 items selected")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(await getPinnedSection().findAllByRole("link")).toHaveLength(2);
    expect(getPinnedSection().queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/items? selected/)).not.toBeInTheDocument();
  });

  it("should not expose selection in a read-only collection", async () => {
    await setup({
      collection: createMockCollection({
        ...defaultCollection,
        can_write: false,
      }),
    });

    expect(screen.getByText(tableQuestion.name)).toBeInTheDocument();
    expect(getPinnedSection().getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
