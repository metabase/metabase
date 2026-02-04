import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { push } from "react-router-redux";

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
import {
  createMockCollection,
  createMockRecentTableDatabaseInfo,
  createMockRecentTableItem,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

jest.mock("react-router-redux", () => ({
  push: jest.fn(() => ({
    type: "@@router/CALL_HISTORY_METHOD",
    payload: { method: "push" },
  })),
}));

import { EmbeddingHub } from "./EmbeddingHub";

const mockPush = push as jest.MockedFunction<typeof push>;

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
  fetchMock.get("path:/api/ee/embedding-hub/checklist", checklist);

  return renderWithProviders(<EmbeddingHub />, { storeInitialState: state });
};

describe("EmbeddingHub", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

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

  it("opens table picker when 'Create a dashboard' is clicked", async () => {
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

    expect(mockPush).toHaveBeenCalledWith("/auto/dashboard/table/10");
  });

  it("has correct href link for Configure SSO card", async () => {
    setup();

    const configureSsoLink = screen.getByRole("link", {
      name: /configure sso/i,
    });
    expect(configureSsoLink).toBeInTheDocument();

    expect(configureSsoLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/embedded-analytics-js.html?utm_source=product&utm_medium=docs&utm_campaign=embedding_hub&utm_content=secure-embeds&source_plan=oss#set-up-sso",
    );
  });

  it("shows success banner when first 3 steps are completed", async () => {
    setup({
      checklist: {
        "add-data": true,
        "create-dashboard": true,
        "create-test-embed": true,
        "create-models": false,
        "configure-row-column-security": false,
        "embed-production": false,
        "secure-embeds": false,
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
