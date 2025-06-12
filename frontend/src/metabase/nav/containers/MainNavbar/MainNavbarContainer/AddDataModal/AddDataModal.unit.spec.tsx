import userEvent from "@testing-library/user-event";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCollection,
  createMockDatabase,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { AddDataModal } from "./AddDataModal";

interface SetupOpts {
  isAdmin?: boolean;
  opened?: boolean;
  uploadsEnabled?: boolean;
  canUpload?: boolean;
}

const setup = ({
  isAdmin = true,
  opened = true,
  uploadsEnabled = false,
  canUpload = true,
}: SetupOpts = {}) => {
  const rootCollection = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: true,
  });

  const database = createMockDatabase({
    uploads_enabled: uploadsEnabled,
    can_upload: isAdmin || canUpload,
  });

  const collections = [rootCollection];
  const databases = [database];

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
    }),
    entities: createMockEntitiesState({
      databases,
      collections,
    }),
    settings: createMockSettingsState(
      createMockSettings({
        "uploads-settings": {
          db_id: uploadsEnabled ? database.id : null,
          schema_name: "uploads",
          table_prefix: "uploaded_",
        },
      }),
    ),
  });

  setupDatabaseListEndpoint(databases);

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

  it("should have database tab selected by default", () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    expect(databaseTab).toHaveAttribute("data-active", "true");
  });

  it("should allow to change tabs", async () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    const csvTab = screen.getByRole("tab", { name: /CSV$/ });

    expect(databaseTab).toHaveAttribute("data-active", "true");
    await userEvent.click(csvTab);
    expect(databaseTab).not.toHaveAttribute("data-active");
    expect(csvTab).toHaveAttribute("data-active", "true");
  });

  it("should maintain the tab selection state", async () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    expect(databaseTab).toHaveAttribute("data-active", "true");

    await userEvent.click(databaseTab);
    // Tab should remain selected after clicking
    expect(databaseTab).toHaveAttribute("data-active", "true");
  });

  describe("database panel", () => {
    it("should show database panel for admin users", () => {
      setup({ isAdmin: true });

      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("Manage databases")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Search databases"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "PostgreSQL" }),
      ).toBeInTheDocument();
    });

    it("should show limited view for non-admin users", () => {
      setup({ isAdmin: false });

      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
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
          /To add a new database, please contact your administrator/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("CSV panel", () => {
    it("should show CSV panel for admin users", async () => {
      setup({ isAdmin: true, uploadsEnabled: true });

      await userEvent.click(screen.getByRole("tab", { name: /CSV$/ }));
      expect(screen.getByText("Manage uploads")).toBeInTheDocument();

      expect(screen.getByText("Drag and drop a file here")).toBeInTheDocument();
      expect(
        screen.getByText(".csv or .tsv files, 50 MB max"),
      ).toBeInTheDocument();
      expect(screen.getByText("Select a file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    });

    it("should prompt the admin to enable uploads", async () => {
      setup({ isAdmin: true, uploadsEnabled: false });

      await userEvent.click(screen.getByRole("tab", { name: /CSV$/ }));
      expect(screen.getByText("Manage uploads")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^To work with CSVs, enable file uploads/),
      ).toBeInTheDocument();
      expect(screen.getByText("Enable uploads")).toBeInTheDocument();
    });

    it("regular user should be instructed to contact their admin in order to enable uploads", async () => {
      setup({ isAdmin: false, uploadsEnabled: false, canUpload: true });

      await userEvent.click(screen.getByRole("tab", { name: /CSV$/ }));
      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Work with CSVs, just like with any other data source.",
        ),
      ).toBeInTheDocument();

      const alert = screen.getByRole("alert");
      expect(
        within(alert).getByText(
          /^To enable CSV file upload, please contact your administrator at/,
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).getByText("admin@metabase.test"),
      ).toBeInTheDocument();
    });

    it("regular user should be instructed to contact their admin in order to gain upload permissions", async () => {
      setup({ isAdmin: false, uploadsEnabled: true, canUpload: false });

      await userEvent.click(screen.getByRole("tab", { name: /CSV$/ }));
      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Work with CSVs, just like with any other data source.",
        ),
      ).toBeInTheDocument();

      const alert = screen.getByRole("alert");
      expect(
        within(alert).getByText(
          /^You are not permitted to upload CSV files. To get proper permissions, please contact your administrator at/,
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).getByText("admin@metabase.test"),
      ).toBeInTheDocument();
    });

    it("should show CSV panel for a regular user with sufficient permissions", async () => {
      setup({ isAdmin: false, uploadsEnabled: true, canUpload: true });

      await userEvent.click(screen.getByRole("tab", { name: /CSV$/ }));
      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();

      expect(screen.getByText("Drag and drop a file here")).toBeInTheDocument();
      expect(
        screen.getByText(".csv or .tsv files, 50 MB max"),
      ).toBeInTheDocument();
      expect(screen.getByText("Select a file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    });
  });
});
