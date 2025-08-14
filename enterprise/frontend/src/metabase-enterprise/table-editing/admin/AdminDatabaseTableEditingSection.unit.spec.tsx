import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { AdminDatabaseTableEditingSection } from "./AdminDatabaseTableEditingSection";

const setup = (database: Partial<Database>) => {
  const mockDatabase = createMockDatabase(database);

  return renderWithProviders(
    <AdminDatabaseTableEditingSection
      database={mockDatabase}
      updateDatabase={() => Promise.resolve()}
    />,
  );
};

describe("AdminDatabaseTableEditingSection", () => {
  it("should render for supported engines", () => {
    setup({
      features: ["actions/data-editing"],
    });
    expect(
      screen.getByTestId("database-table-editing-section"),
    ).toBeInTheDocument();
  });

  it("should not render for unsupported engines", () => {
    setup({});
    expect(
      screen.queryByTestId("database-table-editing-section"),
    ).not.toBeInTheDocument();
  });
});
