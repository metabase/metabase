import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { BrowseDatabases } from "./BrowseDatabases";

type setupOpts = {
  isAdmin?: boolean;
};

const renderBrowseDatabases = (modelCount: number, config?: setupOpts) => {
  const databases = mockDatabases.slice(0, modelCount);
  setupDatabasesEndpoints(databases);

  const user = createMockUser({ is_superuser: config?.isAdmin });
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

  describe("Add database card", () => {
    it("should not render for regular users", async () => {
      const modelCount = 2;

      renderBrowseDatabases(modelCount, { isAdmin: false });
      await waitForLoaderToBeRemoved();

      for (let i = 0; i < modelCount; i++) {
        expect(await screen.findByText(`Database ${i}`)).toBeInTheDocument();
      }
      expect(screen.queryByText("Add a database")).not.toBeInTheDocument();
    });

    it("should render for admins", async () => {
      renderBrowseDatabases(2, { isAdmin: true });
      await waitForLoaderToBeRemoved();

      expect(screen.getByText("Add a database")).toBeInTheDocument();
    });

    it("should render when no databases exist", async () => {
      renderBrowseDatabases(0, { isAdmin: true });
      await waitForLoaderToBeRemoved();

      expect(screen.getByText("Add a database")).toBeInTheDocument();
    });
  });
});
