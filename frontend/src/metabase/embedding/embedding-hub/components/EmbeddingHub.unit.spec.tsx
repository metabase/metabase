import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { push } from "react-router-redux";

import {
  setupDatabaseListEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
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

const setup = ({ isAdmin = true } = {}) => {
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

  // Additional query param variant for uploadable databases
  fetchMock.get({
    url: "path:/api/database",
    query: { include_only_uploadable: true },
    response: { data: [], total: 0 },
  });
  fetchMock.get("path:/api/ee/embedding-hub/checklist", {});

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

  it("opens DataPickerModal when 'Create a dashboard' is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Create a dashboard"));

    const dialog = await screen.findByTestId("entity-picker-modal");
    expect(dialog).toBeInTheDocument();

    expect(
      await within(dialog).findByText("Choose a table to generate a dashboard"),
    ).toBeInTheDocument();

    expect(
      await within(dialog).findByText("Foo Bar Table"),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByText("Foo Bar Table"));

    expect(mockPush).toHaveBeenCalledWith("/auto/dashboard/table/10");
  });
});
