import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentType } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionTreeEndpoint,
  setupDashboardEndpoints,
  setupDocumentEndpoints,
  setupSearchEndpoints,
  setupUnauthorizedCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  Collection,
  CollectionItem,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDocument,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DashboardsPage } from "../../dashboards/pages/DashboardsPage";
import { DocumentsPage } from "../../documents/pages/DocumentsPage";
import {
  DASHBOARDS_COLLECTION,
  DOCUMENTS_COLLECTION,
  LIBRARY_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../test-utils";
import type { LibraryItemModel } from "../../types";

const ITEM_ID = 20;

const SALES_FOLDER = createMockCollectionItem({
  id: 3,
  model: "collection",
  name: "Sales",
});

type SectionCase = {
  model: LibraryItemModel;
  SectionPage: ComponentType;
  path: string;
  sectionCollection: Collection;
  itemName: string;
  emptyMessage: string;
  newItemLabel: RegExp;
  createModalTitle: string;
  setupItemEndpoints: () => void;
  trashMessage: string;
  archiveBody: Record<string, unknown>;
  restoreBody: Record<string, unknown>;
};

const SECTION_CASES: SectionCase[] = [
  {
    model: "dashboard",
    SectionPage: DashboardsPage,
    path: "/data-studio/dashboards",
    sectionCollection: DASHBOARDS_COLLECTION,
    itemName: "Revenue overview",
    emptyMessage: "No dashboards yet",
    newItemLabel: /Dashboard/,
    createModalTitle: "New dashboard",
    setupItemEndpoints: () =>
      setupDashboardEndpoints(
        createMockDashboard({ id: ITEM_ID, name: "Revenue overview" }),
      ),
    trashMessage: "Are you sure you want to do this?",
    archiveBody: { archived: true },
    restoreBody: { archived: false },
  },
  {
    model: "document",
    SectionPage: DocumentsPage,
    path: "/data-studio/documents",
    sectionCollection: DOCUMENTS_COLLECTION,
    itemName: "Quarterly review",
    emptyMessage: "No documents yet",
    newItemLabel: /Document/,
    createModalTitle: "New document",
    setupItemEndpoints: () =>
      setupDocumentEndpoints(
        createMockDocument({ id: ITEM_ID, name: "Quarterly review" }),
      ),
    trashMessage:
      "This will trash the document and the questions that are saved in it. Are you sure you want to do this?",
    archiveBody: { id: ITEM_ID, archived: true },
    restoreBody: { id: ITEM_ID, archived: false },
  },
];

describe.each(SECTION_CASES)("LibrarySectionPage for $model", (sectionCase) => {
  const { model, SectionPage, path } = sectionCase;
  const folder: CollectionItem = {
    ...SALES_FOLDER,
    type: sectionCase.sectionCollection.type,
    here: [model],
  };
  const item = createMockCollectionItem({
    id: ITEM_ID,
    model,
    name: sectionCase.itemName,
    can_write: true,
  });
  const itemUrl = `${path}/${ITEM_ID}`;

  type SetupOpts = {
    hasLibrary?: boolean;
    canRead?: boolean;
    canWrite?: boolean;
    isRemoteSyncReadOnly?: boolean;
    items?: CollectionItem[];
    searchResults?: SearchResult[];
    hasItemsError?: boolean;
  };

  function setup({
    hasLibrary = true,
    canRead = true,
    canWrite = true,
    isRemoteSyncReadOnly = false,
    items = [folder, item],
    searchResults = [],
    hasItemsError = false,
  }: SetupOpts = {}) {
    mockGetBoundingClientRect({ width: 1000, height: 800 });
    const settings = mockSettings({
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: isRemoteSyncReadOnly,
      }),
      "remote-sync-enabled": isRemoteSyncReadOnly,
      "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
    });
    setupEnterpriseOnlyPlugin("library");
    setupEnterpriseOnlyPlugin("remote_sync");

    const sectionCollection = createMockCollection({
      ...sectionCase.sectionCollection,
      can_write: canWrite,
    });
    const libraryCollection = createMockCollection({
      ...LIBRARY_COLLECTION,
      children: canRead ? [sectionCollection] : [],
    });
    setupCollectionTreeEndpoint(hasLibrary ? [libraryCollection] : []);
    if (hasItemsError) {
      setupUnauthorizedCollectionEndpoints(sectionCollection);
    } else {
      setupCollectionItemsEndpoint({
        collection: sectionCollection,
        collectionItems: items,
      });
    }
    setupSearchEndpoints(searchResults);
    setupLibraryCollectionEndpoints();
    sectionCase.setupItemEndpoints();

    return renderWithProviders(
      <Route path={path} element={<SectionPage />} />,
      {
        withRouter: true,
        withUndos: true,
        initialRoute: path,
        storeInitialState: createMockState({ settings }),
      },
    );
  }

  async function selectItemRow() {
    const itemRow = await screen.findByRole("row", {
      name: new RegExp(item.name),
    });
    await userEvent.click(
      within(itemRow).getByRole("checkbox", { name: "Select row" }),
    );
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
  }

  it("lists folders and items at the top level, linking each item to its Data Studio page", async () => {
    setup();

    expect(await screen.findByText("Sales")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("collection-name").map((row) => row.textContent),
    ).toEqual(["Sales"]);
    expect(
      screen.getByRole("link", { name: new RegExp(item.name) }),
    ).toHaveAttribute("href", itemUrl);
  });

  it("opens the New collection modal in the section collection", async () => {
    const { store } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Collection/ }),
    );

    expect(store.getState().modal).toMatchObject({
      id: "collection",
      props: {
        initialCollectionId: sectionCase.sectionCollection.id,
        namespaces: [null],
        pickerOptions: { hasLibrary: true, hasRootCollection: false },
      },
    });
  });

  it("opens the New item modal from the New menu", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: sectionCase.newItemLabel }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: sectionCase.createModalTitle,
      }),
    ).toBeInTheDocument();
  });

  it.each([
    { name: "the user cannot write", canWrite: false },
    { name: "remote sync is read-only", isRemoteSyncReadOnly: true },
  ])("hides New when $name", async ({ canWrite, isRemoteSyncReadOnly }) => {
    setup({ canWrite, isRemoteSyncReadOnly });

    expect(await screen.findByText(item.name)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("says when the section is empty", async () => {
    setup({ items: [] });

    expect(
      await screen.findByText(sectionCase.emptyMessage),
    ).toBeInTheDocument();
  });

  it("searches only the section's items and reports when nothing matches", async () => {
    setup({
      searchResults: [
        createMockSearchResult({
          id: ITEM_ID,
          model,
          name: item.name,
        }),
      ],
    });
    const searchInput = await screen.findByPlaceholderText("Search...");

    await userEvent.type(searchInput, item.name);
    await waitFor(() =>
      expect(screen.queryByText("Sales")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("link", { name: new RegExp(item.name) }),
    ).toHaveAttribute("href", itemUrl);
    const searchCall = fetchMock.callHistory.lastCall("path:/api/search");
    expect(
      new URL(searchCall?.url ?? "").searchParams.getAll("models"),
    ).toEqual([model]);

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "churn");
    expect(
      await screen.findByText('No results for "churn"'),
    ).toBeInTheDocument();
  });

  it("reports an error when the items cannot be fetched", async () => {
    setup({ hasItemsError: true });

    expect(
      await screen.findByText(/Data couldn't be fetched properly/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  it("moves a selected item to the trash and refreshes the list", async () => {
    setup();
    await selectItemRow();

    setupCollectionItemsEndpoint({
      collection: sectionCase.sectionCollection,
      collectionItems: [folder],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(sectionCase.trashMessage);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() =>
      expect(screen.queryByText(item.name)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.queryByText("1 item selected")).not.toBeInTheDocument();
    expect(getUpdateBodies()).toEqual([sectionCase.archiveBody]);

    const toast = await screen.findByText("Moved to trash");
    expect(toast).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(getUpdateBodies()).toEqual([
        sectionCase.archiveBody,
        sectionCase.restoreBody,
      ]),
    );
    expect(await screen.findByText("Restored")).toBeInTheDocument();
  });

  function getUpdateBodies(): unknown[] {
    return fetchMock.callHistory
      .calls(`path:/api/${model}/${ITEM_ID}`, { method: "PUT" })
      .map((call): unknown => JSON.parse(String(call.options.body)));
  }

  it("selects every top-level row with Select all, and clears them on a second click", async () => {
    setup();
    const selectAll = await screen.findByRole("checkbox", {
      name: "Select all",
    });

    await selectItemRow();
    expect(selectAll).toBePartiallyChecked();

    await userEvent.click(selectAll);
    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(selectAll).toBeChecked();
    expect(
      within(screen.getByRole("row", { name: /Sales/ })).getByRole("checkbox"),
    ).toBeChecked();

    await userEvent.click(selectAll);
    await waitFor(() =>
      expect(screen.queryByText("2 items selected")).not.toBeInTheDocument(),
    );
    expect(selectAll).not.toBeChecked();
    expect(selectAll).not.toBePartiallyChecked();
  });

  it("clears the selection when the search changes", async () => {
    setup();
    await selectItemRow();

    await userEvent.type(screen.getByPlaceholderText("Search..."), "sales");

    await waitFor(() =>
      expect(screen.queryByText("1 item selected")).not.toBeInTheDocument(),
    );
  });

  it("offers no row selection when remote sync is read-only", async () => {
    setup({ isRemoteSyncReadOnly: true });

    expect(await screen.findByText(item.name)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says the user has no access when they cannot read the section collection", async () => {
    setup({ canRead: false });

    expect(
      await screen.findByText("Sorry, you don’t have permission to see that."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
    expect(
      screen.queryByText(sectionCase.emptyMessage),
    ).not.toBeInTheDocument();
  });

  it("offers to create the semantic layer when there is no library", async () => {
    setup({ hasLibrary: false });

    expect(
      await screen.findByText("Create my semantic layer"),
    ).toBeInTheDocument();
  });
});
