import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingHub } from "./EmbeddingHub";

const setup = ({ isAdmin = true } = {}) => {
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "show-metabase-links": true,
    }),
  });

  return renderWithProviders(<EmbeddingHub />, { storeInitialState: state });
};

describe("EmbeddingHub", () => {
  it("opens AddDataModal when 'Add data' button is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Add your data"));
    await userEvent.click(screen.getByText("Add data"));

    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.getByRole("heading", { name: "Add data" }),
    ).toBeInTheDocument();
  });

  it("opens CreateDashboardModal when 'Build your own' button is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Create a dashboard"));
    await userEvent.click(screen.getByText("Build your own"));

    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.getByRole("heading", { name: "New dashboard" }),
    ).toBeInTheDocument();
  });
});
