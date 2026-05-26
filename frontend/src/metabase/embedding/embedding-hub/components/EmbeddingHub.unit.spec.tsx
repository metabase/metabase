import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabaseListEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockCollection,
  createMockDashboard,
  createMockRecentTableDatabaseInfo,
  createMockRecentTableItem,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHub } from "./EmbeddingHub";

const setup = ({ isAdmin = true, checklist = {} } = {}) => {
  mockGetBoundingClientRect();
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "show-metabase-links": true,
    }),
  });

  setupRecentViewsAndSelectionsEndpoints(
    [
      createMockRecentTableItem({
        id: 10,
        name: "foobar",
        display_name: "Foo Bar Table",
        database: createMockRecentTableDatabaseInfo({
          id: 1,
        }),
      }),
    ],
    ["selections"],
  );

  setupSearchEndpoints([]);
  setupDatabaseListEndpoint([]);
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ id: "root" }),
      createMockCollection({ id: 1 }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: "root" }),
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: 1 }),
    collectionItems: [],
  });

  // Additional query param variant for uploadable databases
  fetchMock.get({
    url: "path:/api/database",
    query: { include_only_uploadable: true },
    response: { data: [], total: 0 },
  });
  fetchMock.get("path:/api/ee/embedding-hub/checklist", {
    checklist,
    "data-isolation-strategy": null,
  });

  return renderWithProviders(<EmbeddingHub />, {
    storeInitialState: state,
    withUndos: true,
  });
};

describe("EmbeddingHub", () => {
  it("opens AddDataModal when 'Connect a database' is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Connect a database"));

    await waitFor(() => {
      const dialog = within(screen.getByRole("dialog"));
      expect(
        dialog.getByRole("heading", { name: "Add data" }),
      ).toBeInTheDocument();
    });
  });

  it("creates and saves an x-ray dashboard when a table is picked", async () => {
    const xrayDashboard = createMockDashboard({
      id: 10,
      name: "A look at Foo Bar Table",
    });
    const savedDashboard = createMockDashboard({
      id: 42,
      name: "A look at Foo Bar Table",
    });

    fetchMock.get("path:/api/automagic-dashboards/table/10", xrayDashboard);
    fetchMock.post("path:/api/dashboard/save", savedDashboard);

    setup();

    await userEvent.click(await screen.findByText("Create a dashboard"));

    const dialog = await screen.findByTestId("entity-picker-modal");
    expect(dialog).toBeInTheDocument();

    expect(
      await within(dialog).findByText("Choose a table to generate a dashboard"),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Recent items"));

    expect(
      await within(dialog).findByText("Foo Bar Table"),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByText("Foo Bar Table"));

    expect(
      await screen.findByText("Your dashboard was saved"),
    ).toBeInTheDocument();
    expect(screen.getByText("See it")).toBeInTheDocument();

    expect(screen.queryByTestId("entity-picker-modal")).not.toBeInTheDocument();
  });

  it("shows an error toast when x-ray dashboard creation fails", async () => {
    fetchMock.get("path:/api/automagic-dashboards/table/10", 500);

    setup();

    await userEvent.click(await screen.findByText("Create a dashboard"));

    const dialog = await screen.findByTestId("entity-picker-modal");

    await userEvent.click(await screen.findByText("Recent items"));

    expect(
      await within(dialog).findByText("Foo Bar Table"),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByText("Foo Bar Table"));

    expect(
      await screen.findByText("Failed to create dashboard"),
    ).toBeInTheDocument();
  });

  it("shows success banner when first 3 steps are completed", async () => {
    setup({
      checklist: {
        "add-data": true,
        "create-dashboard": true,
        "create-test-embed": true,
        "configure-row-column-security": false,
        "embed-production": false,
        "sso-configured": false,
        "data-permissions-and-enable-tenants": false,
      },
    });

    const alert = screen.getByRole("alert");

    expect(
      await within(alert).findByText(
        /If all you want is a simple embedded dashboard, you're done!/,
      ),
    ).toBeInTheDocument();

    expect(
      within(alert).getByRole("img", { name: "check icon" }),
    ).toBeInTheDocument();
  });
});
