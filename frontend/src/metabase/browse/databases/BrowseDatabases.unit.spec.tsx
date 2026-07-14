import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { BrowseDatabases } from "./BrowseDatabases";

type setupOpts = {
  isAdmin?: boolean;
};

const renderBrowseDatabases = (modelCount: number, config?: setupOpts) => {
  const databases = mockDatabases.slice(0, modelCount);
  setupDatabaseListEndpoint(databases);

  const user = createMockUser({ is_superuser: config?.isAdmin ?? false });
  const state = createMockState({ currentUser: user });
  return renderWithProviders(<BrowseDatabases />, { storeInitialState: state });
};

const mockDatabases = [...Array(100)].map((_, index) =>
  createMockDatabase({ id: index, name: `Database ${index}` }),
);

describe("BrowseDatabases", () => {
  it("displays databases", async () => {
    renderBrowseDatabases(10);
    for (let i = 0; i < 10; i++) {
      expect(await screen.findByText(`Database ${i}`)).toBeInTheDocument();
    }
  });

  it("displays a 'no databases' message in the Databases tab when no databases exist", async () => {
    renderBrowseDatabases(0);
    expect(
      await screen.findByText("No databases here yet"),
    ).toBeInTheDocument();
  });

  it("shows Add data in the header for admins", async () => {
    renderBrowseDatabases(2, { isAdmin: true });
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("Add data")).toBeInTheDocument();
    expect(screen.queryByText("Add a database")).not.toBeInTheDocument();
  });

  it("does not show Add data in the header for regular users", async () => {
    renderBrowseDatabases(2, { isAdmin: false });
    await waitForLoaderToBeRemoved();

    expect(screen.queryByText("Add data")).not.toBeInTheDocument();
  });
});
