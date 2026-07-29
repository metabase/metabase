import userEvent from "@testing-library/user-event";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { BrowseSchemas } from "metabase/browse/schemas/BrowseSchemas";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

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

  describe("opening a database through the UI", () => {
    const renderBrowseDatabasesWithRouter = (databases: Database[]) => {
      setupDatabasesEndpoints(databases);
      return renderWithProviders(
        <>
          <Route path="/browse/databases" element={<BrowseDatabases />} />
          <Route path="/browse/databases/:slug" element={<BrowseSchemas />} />
        </>,
        {
          storeInitialState: createMockState({ currentUser: createMockUser() }),
          withRouter: true,
          initialRoute: "/browse/databases",
        },
      );
    };

    const databaseWithSchemas = (
      id: number,
      name: string,
      schemas: [string, string],
    ) =>
      createMockDatabase({
        id,
        name,
        tables: schemas.map((schema, index) =>
          createMockTable({ id: id * 10 + index, db_id: id, schema }),
        ),
      });

    it("opens the database under its name url when the name is unique", async () => {
      const { history } = renderBrowseDatabasesWithRouter([
        databaseWithSchemas(7, "Sales", ["PUBLIC", "ANALYTICS"]),
      ]);

      await userEvent.click(await screen.findByText("Sales"));

      expect(await screen.findByText("PUBLIC")).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/Sales",
      );
    });

    it.each([
      [0, "ALPHA"],
      [1, "GAMMA"],
    ])(
      "opens the right database when two share a name (card %i)",
      async (index, expectedSchema) => {
        renderBrowseDatabasesWithRouter([
          databaseWithSchemas(4, "Prod", ["ALPHA", "BETA"]),
          databaseWithSchemas(9, "Prod", ["GAMMA", "DELTA"]),
        ]);

        const cards = await screen.findAllByText("Prod");
        await userEvent.click(cards[index]);

        expect(await screen.findByText(expectedSchema)).toBeInTheDocument();
      },
    );

    it("opens a database whose name starts with a digit", async () => {
      // "7-sales" as a url segment would be read back as database 7
      const { history } = renderBrowseDatabasesWithRouter([
        databaseWithSchemas(3, "7-sales", ["ONE", "TWO"]),
      ]);

      await userEvent.click(await screen.findByText("7-sales"));

      expect(await screen.findByText("ONE")).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).not.toBe(
        "/browse/databases/7-sales",
      );
    });
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
