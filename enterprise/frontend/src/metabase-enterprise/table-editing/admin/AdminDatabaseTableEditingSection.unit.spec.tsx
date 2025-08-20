import { renderWithProviders, screen } from "__support__/ui";
import type { DatabaseLocalSettingAvailability } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DATABASE_TABLE_EDITING_SETTING } from "../settings";

import { AdminDatabaseTableEditingSection } from "./AdminDatabaseTableEditingSection";

const setup = (
  setting: DatabaseLocalSettingAvailability = { enabled: true },
) => {
  const mockDatabase = createMockDatabase();

  return renderWithProviders(
    <AdminDatabaseTableEditingSection
      database={mockDatabase}
      settingsAvailable={{
        [DATABASE_TABLE_EDITING_SETTING]: setting,
      }}
      updateDatabase={() => Promise.resolve()}
    />,
  );
};

describe("AdminDatabaseTableEditingSection", () => {
  it("should render for supported engines", () => {
    setup({
      enabled: true,
    });
    expect(
      screen.getByTestId("database-table-editing-section"),
    ).toBeInTheDocument();
  });

  it("should render disabled toggle for disabled reasons", () => {
    setup({
      enabled: false,
      reasons: [
        {
          key: "permissions/no-writeable-tables",
          message: "Database connection is read-only",
        },
      ],
    });

    expect(
      screen.getByTestId("database-table-editing-section"),
    ).toBeInTheDocument();

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(
      screen.getByText("Database connection is read-only"),
    ).toBeInTheDocument();
  });
});
