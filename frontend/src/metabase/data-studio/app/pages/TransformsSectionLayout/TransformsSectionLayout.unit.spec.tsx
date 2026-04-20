import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupStoreEEBillingEndpoint,
  setupStoreEECloudAddOnsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformsSectionLayout } from "./TransformsSectionLayout";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => "App Switcher",
}));

const setup = ({
  isHosted = false,
  hasTransformFeature = false,
  transformsEnabled = false,
  isAdmin = false,
  databases = [],
}: {
  isHosted?: boolean;
  hasTransformFeature?: boolean;
  transformsEnabled?: boolean;
  isAdmin?: boolean;
  databases?: Database[];
} = {}) => {
  setupUserMetabotPermissionsEndpoint();
  setupDatabaseListEndpoint(databases);

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      "transforms-basic": hasTransformFeature,
      hosting: isHosted,
    }),
    "transforms-enabled": transformsEnabled,
    "is-hosted?": isHosted,
  });

  if (isHosted || hasTransformFeature) {
    setupEnterpriseOnlyPlugin("transforms");
  }

  const path = "/transforms";

  renderWithProviders(
    <Route
      path={path}
      component={() => (
        <TransformsSectionLayout>List of transforms</TransformsSectionLayout>
      )}
    />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: isAdmin }),
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
        databases: [createMockDatabase({ transforms_permissions: "write" })],
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
        databases: [createMockDatabase({ transforms_permissions: "write" })],
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
      setup({ isHosted: true });
      await assertDataStudioUpsellPage();
    });

    it("should show you an upsell page if you are hosted and the transform feature is not present, even when transforms are enabled on the instance", async () => {
      setup({ isHosted: true, transformsEnabled: true });
      await assertDataStudioUpsellPage();
    });

    it("should show you the app if the instance is hosted and the transform feature is present", async () => {
      setup({
        isHosted: true,
        hasTransformFeature: true,
        databases: [createMockDatabase({ transforms_permissions: "write" })],
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

    it("should not show the 'View your database connections' button for non-admin users", async () => {
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
  });
});

const assertInApp = async () =>
  expect(await screen.findByText("List of transforms")).toBeInTheDocument();
const assertEnableScreen = async () =>
  expect(
    await screen.findByText("Customize and clean up your data"),
  ).toBeInTheDocument();

const assertDataStudioUpsellPage = async () =>
  expect(
    await screen.findByText("Start transforming your data in Metabase"),
  ).toBeInTheDocument();

const assertNoWritableDatabasesEmptyState = async () =>
  expect(
    await screen.findByText(
      "To use transforms, you need a writable database connection",
    ),
  ).toBeInTheDocument();
