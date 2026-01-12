import { renderWithProviders, screen } from "__support__/ui";
import type { DatabaseLocalSettingAvailability } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DATABASE_TABLE_EDITING_SETTING } from "../settings";

import { AdminDatabaseTableEditingSection } from "./AdminDatabaseTableEditingSection";

const setup = (options: {
  driverSetting?: DatabaseLocalSettingAvailability;
  engine?: string;
}) => {
  const { driverSetting = { enabled: true }, engine = "h2" } = options;
  const mockDatabase = createMockDatabase({ engine });

  return renderWithProviders(
    <AdminDatabaseTableEditingSection
      database={mockDatabase}
      settingsAvailable={{
        [DATABASE_TABLE_EDITING_SETTING]: driverSetting,
      }}
      updateDatabase={() => Promise.resolve()}
    />,
  );
};

describe("AdminDatabaseTableEditingSection", () => {
  it.each(["postgres", "mysql"])(
    "should render for supported engine: %s",
    (engine) => {
      setup({ engine });
      expect(
        screen.getByTestId("database-table-editing-section"),
      ).toBeInTheDocument();
    },
  );

  it("should hide section for unsupported engines", () => {
    setup({ engine: "h2" });
    expect(
      screen.queryByTestId("database-table-editing-section"),
    ).not.toBeInTheDocument();
  });

  it("should render disabled toggle for specific disabled reasons", () => {
    setup({
      driverSetting: {
        enabled: false,
        reasons: [
          {
            key: "permissions/no-writable-table",
            message: "Database connection is read-only",
          },
        ],
      },
      engine: "postgres",
    });

    expect(
      screen.getByTestId("database-table-editing-section"),
    ).toBeInTheDocument();

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(
      screen.getByText("Database connection is read-only"),
    ).toBeInTheDocument();
  });

  it("should hide section for other disabled reasons", () => {
    setup({
      driverSetting: {
        enabled: false,
        reasons: [
          {
            key: "driver-feature-missing",
            message: "The driver does not support table editing",
          },
        ],
      },
      engine: "mysql",
    });

    expect(
      screen.queryByTestId("database-table-editing-section"),
    ).not.toBeInTheDocument();
  });
});
