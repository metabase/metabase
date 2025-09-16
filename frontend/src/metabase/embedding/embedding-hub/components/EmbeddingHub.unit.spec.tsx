import userEvent from "@testing-library/user-event";
import { push } from "react-router-redux";

import {
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

  return renderWithProviders(<EmbeddingHub />, { storeInitialState: state });
};

describe("EmbeddingHub", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("opens AddDataModal when 'Add data' is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Add data"));

    await waitFor(() => {
      const dialog = within(screen.getByRole("dialog"));
      expect(
        dialog.getByRole("heading", { name: "Add data" }),
      ).toBeInTheDocument();
    });
  });

  it("opens DataPickerModal when 'Generate a dashboard' is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Generate a dashboard"));

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
