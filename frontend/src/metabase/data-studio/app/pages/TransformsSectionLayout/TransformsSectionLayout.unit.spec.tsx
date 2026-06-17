import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
  setupStoreEEBillingEndpoint,
  setupStoreEECloudAddOnsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Database } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformsSectionLayout } from "./TransformsSectionLayout";

const createTransformSupportedDatabase = (opts?: Partial<Database>) =>
  createMockDatabase({
    features: [...COMMON_DATABASE_FEATURES, "transforms/table"],
    ...opts,
  });

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => "App Switcher",
}));

const setup = ({
  isHosted = false,
  hasTransformFeature = false,
  transformsEnabled = false,
  isAdmin = false,
  isStoreUser = false,
  canAccessDbDetails = false,
  databases = [],
  databasesError = false,
}: {
  isHosted?: boolean;
  hasTransformFeature?: boolean;
  transformsEnabled?: boolean;
  isAdmin?: boolean;
  isStoreUser?: boolean;
  canAccessDbDetails?: boolean;
  databases?: Database[];
  databasesError?: boolean;
} = {}) => {
  setupUserMetabotPermissionsEndpoint();
  if (databasesError) {
    fetchMock.get("path:/api/database", 500);
  } else {
    setupDatabaseListEndpoint(databases);
  }

  const storeUserEmail = "store-user@example.com";
  const currentUser = createMockUser({ is_superuser: isAdmin });
  if (isStoreUser) {
    currentUser.email = storeUserEmail;
  }

  const settingsValues = createMockSettings({
    "token-features": createMockTokenFeatures({
      "transforms-basic": hasTransformFeature,
      hosting: isHosted,
    }),
    "transforms-enabled": transformsEnabled,
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: storeUserEmail }] : [],
      features: [],
    },
  });
  const settings = mockSettings(settingsValues);

  setupPropertiesEndpoints(settingsValues);

  if (isHosted || hasTransformFeature) {
    setupEnterpriseOnlyPlugin("transforms");
  }

  const path = "/transforms";

  renderWithProviders(
    <Route
      path={path}
      component={(props) => (
        <TransformsSectionLayout {...props}>
          <div>List of transforms</div>
        </TransformsSectionLayout>
      )}
    />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({
          is_superuser: isAdmin,
          permissions: { can_access_db_details: canAccessDbDetails },
        }),
      }),
      withRouter: true,
      initialRoute: path,
    },
  );
};

describe("TransformSectionLayout", () => {
  describe("OSS", () => {
    it("should show you an enable transforms screen in OSS if transforms are not enabled", async () => {
      setup();
      await assertEnableScreen();
    });
    it("should show you an enable transforms screen with an enable button if you are an admin and transforms are not enabled", async () => {
      setup({ isAdmin: true });
      await assertEnableScreen();

      expect(
        await screen.findByRole("button", { name: "Enable transforms" }),
      ).toBeInTheDocument();
    });
    it("should show allow you into transforms if transforms are enabled and writable databases exist", async () => {
      setup({
        transformsEnabled: true,
        databases: [
          createTransformSupportedDatabase({ transforms_permissions: "write" }),
        ],
      });

      await assertInApp();
    });
  });

  describe("Pro Self Hosted", () => {
    it("Should show you enable screen if transforms are not enabled", async () => {
      setup({ hasTransformFeature: true });
      await assertEnableScreen();
    });

    it("Should only allow you into transforms if you transforms are enabled", async () => {
      setup({
        hasTransformFeature: true,
        transformsEnabled: true,
        databases: [
          createTransformSupportedDatabase({ transforms_permissions: "write" }),
        ],
      });
      await assertInApp();
    });
  });

  describe("Pro Hosted", () => {
    beforeEach(() => {
      setupStoreEECloudAddOnsEndpoint(5);
      setupStoreEEBillingEndpoint(5);
    });

    it("should show you an upsell page if you are hosted and the transform feature is not present", async () => {
      setup({ isHosted: true, isStoreUser: true });
      await assertEnableScreen();
    });

    it("should show you an upsell page if you are hosted and the transform feature is not present, even when transforms are enabled on the instance", async () => {
      setup({ isHosted: true, isStoreUser: true, transformsEnabled: true });
      await assertEnableScreen();
    });

    it("should show you the app if the instance is hosted and the transform feature is present", async () => {
      setup({
        isHosted: true,
        hasTransformFeature: true,
        databases: [
          createTransformSupportedDatabase({ transforms_permissions: "write" }),
        ],
      });
      await assertInApp();
    });
  });

  describe("No writable databases", () => {
    it("should show empty state when no databases are writable or supported", async () => {
      setup({
        transformsEnabled: true,
        databases: [
          createMockDatabase({ id: 1, transforms_permissions: "none" }),
          createMockDatabase({
            id: 2,
            transforms_permissions: "write",
            is_sample: true,
          }),
          createMockDatabase({
            id: 3,
            transforms_permissions: "write",
            router_database_id: 99,
          }),
          createMockDatabase({
            id: 4,
            transforms_permissions: "write",
            is_audit: true,
          }),
        ],
      });

      await assertNoWritableDatabasesEmptyState();
    });

    it("should show empty state when transforms are enabled and the database list is empty", async () => {
      setup({
        transformsEnabled: true,
        databases: [],
      });

      await assertNoWritableDatabasesEmptyState();
    });

    it("should show the 'View your database connections' button linking to admin databases for admin users", async () => {
      setup({
        transformsEnabled: true,
        isAdmin: true,
        databases: [],
      });

      await assertNoWritableDatabasesEmptyState();
      const link = screen.getByRole("link", {
        name: "View your database connections",
      });
      expect(link).toHaveAttribute("href", "/admin/databases");
    });

    it("should show the 'View your database connections' button for users with manage database permission", async () => {
      setup({
        transformsEnabled: true,
        isAdmin: false,
        canAccessDbDetails: true,
        databases: [],
      });

      await assertNoWritableDatabasesEmptyState();
      expect(
        screen.getByRole("link", {
          name: "View your database connections",
        }),
      ).toBeInTheDocument();
    });

    it("should not show the 'View your database connections' button for non-admin users without manage database permission", async () => {
      setup({
        transformsEnabled: true,
        isAdmin: false,
        databases: [],
      });

      await assertNoWritableDatabasesEmptyState();
      expect(
        screen.queryByRole("link", {
          name: "View your database connections",
        }),
      ).not.toBeInTheDocument();
    });

    it("should show an error UI (not the empty state) when the databases request fails", async () => {
      setup({
        transformsEnabled: true,
        databasesError: true,
      });

      expect(await screen.findByText(/error/i)).toBeInTheDocument();
      expect(
        screen.queryByText("No compatible database connection"),
      ).not.toBeInTheDocument();
    });
  });
});

const assertInApp = async () =>
  expect(await screen.findByText("List of transforms")).toBeInTheDocument();
const assertEnableScreen = async () =>
  expect(
    await screen.findByText("Customize and clean up your data"),
  ).toBeInTheDocument();

const assertNoWritableDatabasesEmptyState = async () =>
  expect(
    await screen.findByText("No compatible database connection"),
  ).toBeInTheDocument();
