import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_APPLICATION_PERMISSIONS_SELECTORS } from "metabase/current-user";
import { PLUGIN_SCHEMA_VIEWER, reinitialize } from "metabase/plugins";
import { createMockUser } from "metabase-types/api/mocks";

import { DatabaseQuickLinksMenu } from "./DatabaseQuickLinksMenu";

const DATABASE_ID = 7;

type SetupOpts = {
  isAdmin?: boolean;
  canAccessDataModel?: boolean;
  isSchemaViewerEnabled?: boolean;
};

const setup = ({
  isAdmin = false,
  canAccessDataModel,
  isSchemaViewerEnabled = false,
}: SetupOpts = {}) => {
  if (canAccessDataModel != null) {
    PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessDataModel = () =>
      canAccessDataModel;
  }
  PLUGIN_SCHEMA_VIEWER.isEnabled = isSchemaViewerEnabled;

  renderWithProviders(<DatabaseQuickLinksMenu databaseId={DATABASE_ID} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
};

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "Database options" }));

describe("DatabaseQuickLinksMenu", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should not render for a user who can't open any of the links", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Database options" }),
    ).not.toBeInTheDocument();
  });

  it("should link an admin to the database's admin page and Data Studio", async () => {
    setup({ isAdmin: true });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Manage database/ }),
    ).toHaveAttribute("href", `/admin/databases/${DATABASE_ID}`);
    expect(
      screen.getByRole("menuitem", { name: /Edit metadata/ }),
    ).toHaveAttribute("href", `/data-studio/data/database/${DATABASE_ID}`);
  });

  it("should not show the schema viewer without the schema-viewer feature", async () => {
    setup({ isAdmin: true });
    await openMenu();

    await screen.findByRole("menuitem", { name: /Manage database/ });
    expect(
      screen.queryByRole("menuitem", { name: /View schema/ }),
    ).not.toBeInTheDocument();
  });

  it("should link to the schema viewer with the schema-viewer feature", async () => {
    setup({ isAdmin: true, isSchemaViewerEnabled: true });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /View schema/ }),
    ).toHaveAttribute(
      "href",
      `/data-studio/schema-viewer?database-id=${DATABASE_ID}`,
    );
  });

  it("should link a non-admin with data model access to the admin data model", async () => {
    setup({ canAccessDataModel: true, isSchemaViewerEnabled: true });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Edit metadata/ }),
    ).toHaveAttribute("href", `/admin/datamodel/database/${DATABASE_ID}`);
    expect(
      screen.queryByRole("menuitem", { name: /Manage database/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /View schema/ }),
    ).not.toBeInTheDocument();
  });
});
