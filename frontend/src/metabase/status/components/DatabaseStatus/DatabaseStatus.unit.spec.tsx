import userEvent from "@testing-library/user-event";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Database, User } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { DatabaseStatus } from "./DatabaseStatus";
interface SetupOpts {
  databases?: Database[];
  user?: User;
}

const setup = ({ databases = [], user }: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);

  renderWithProviders(<DatabaseStatus />, {
    storeInitialState: createMockState({
      currentUser: user,
    }),
  });
};

describe("DatabaseStatus", () => {
  it("should toggle between small and large versions", async () => {
    setup({
      user: createMockUser({ id: 1 }),
      databases: [
        createMockDatabase({
          creator_id: 1,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(await screen.findByText("Syncing…")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("status"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("should not render when data is not loaded", () => {
    setup();

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should not render when databases are created by another user", () => {
    setup({
      user: createMockUser({ id: 1 }),
      databases: [
        createMockDatabase({
          creator_id: 2,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("assigns 'sync-status-visible' class to body element when database is in sync", async () => {
    setup({
      user: createMockUser({ id: 1 }),
      databases: [
        createMockDatabase({
          creator_id: 1,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    await waitFor(() => {
      expect(document.body).toHaveClass("sync-status-visible");
    });
  });
});
