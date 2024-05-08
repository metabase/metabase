import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { BrowseDatabases } from "./BrowseDatabases";

const renderBrowseDatabases = (modelCount: number) => {
  const databases = mockDatabases.slice(0, modelCount);
  setupDatabasesEndpoints(databases);
  return renderWithProviders(<BrowseDatabases />);
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
});
