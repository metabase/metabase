import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AddDataModal } from "./AddDataModal";

interface SetupOpts {
  isAdmin?: boolean;
  opened?: boolean;
}

const setup = ({ isAdmin = true, opened = true }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
    }),
  });

  renderWithProviders(<AddDataModal onClose={jest.fn()} opened={opened} />, {
    storeInitialState: state,
  });
};

describe("AddDataModal", () => {
  it("should render when opened", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Add data" }),
    ).toBeInTheDocument();
  });

  it("should not render when not opened", () => {
    setup({ opened: false });

    expect(
      screen.queryByRole("dialog", { name: "Add data" }),
    ).not.toBeInTheDocument();
  });

  it("should show database panel for admin users", () => {
    setup({ isAdmin: true });

    expect(screen.getByRole("tab", { name: /Database$/ })).toBeInTheDocument();
    expect(screen.getByText("Manage databases")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search databases")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "PostgreSQL" }),
    ).toBeInTheDocument();
  });

  it("should show limited view for non-admin users", () => {
    setup({ isAdmin: false });

    expect(screen.getByRole("tab", { name: /Database$/ })).toBeInTheDocument();
    expect(screen.queryByText("Manage databases")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add a database" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start exploring in minutes. We support more than 20 data connectors.",
      ),
    ).toBeInTheDocument();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "To add a new database, please contact your administrator.",
      ),
    ).toBeInTheDocument();
  });

  it("should have database tab selected by default", () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    expect(databaseTab).toHaveAttribute("data-active", "true");
  });

  it("should maintain the tab selection state", async () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    expect(databaseTab).toHaveAttribute("data-active", "true");

    await userEvent.click(databaseTab);
    // Tab should remain selected after clicking
    expect(databaseTab).toHaveAttribute("data-active", "true");
  });
});
