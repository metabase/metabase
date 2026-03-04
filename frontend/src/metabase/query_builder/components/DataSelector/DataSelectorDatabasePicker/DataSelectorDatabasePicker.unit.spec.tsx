import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DataSelectorDatabasePicker } from "./DataSelectorDatabasePicker";

const TEST_DATABASE = createMockDatabase();

const setup = (mockDatabases = [TEST_DATABASE]) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: mockDatabases,
    }),
  });
  const metadata = getMetadata(state);
  const databases = mockDatabases.map((db) =>
    checkNotNull(metadata.database(db.id)),
  );

  renderWithProviders(
    <DataSelectorDatabasePicker
      databases={databases}
      onChangeDatabase={jest.fn()}
      onChangeSchema={jest.fn()}
    />,
  );
};

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    setup();
    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });

  it("shows empty state when search returns no results", async () => {
    const databases = [
      createMockDatabase({ id: 1, name: "PostgreSQL Database" }),
      createMockDatabase({ id: 2, name: "MySQL Database" }),
      createMockDatabase({ id: 3, name: "H2 Database" }),
    ];
    setup(databases);

    const searchInput = screen.getByPlaceholderText("Find...");
    await userEvent.type(searchInput, "Oracle");

    expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
  });

  it("shows matching databases when search has results", async () => {
    const databases = [
      createMockDatabase({ id: 1, name: "PostgreSQL Database" }),
      createMockDatabase({ id: 2, name: "MySQL Database" }),
      createMockDatabase({ id: 3, name: "H2 Database" }),
    ];
    setup(databases);

    const searchInput = screen.getByPlaceholderText("Find...");
    await userEvent.type(searchInput, "Post");

    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.queryByText("MySQL Database")).not.toBeInTheDocument();
    expect(screen.queryByText("H2 Database")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Didn't find any results"),
    ).not.toBeInTheDocument();
  });
});
