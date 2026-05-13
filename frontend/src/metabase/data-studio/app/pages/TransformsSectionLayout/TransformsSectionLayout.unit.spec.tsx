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
import {
  createMockSettings,
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
  isStoreUser = false,
}: {
  isHosted?: boolean;
  hasTransformFeature?: boolean;
  transformsEnabled?: boolean;
  isAdmin?: boolean;
  isStoreUser?: boolean;
} = {}) => {
  setupUserMetabotPermissionsEndpoint();

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

  setupDatabaseListEndpoint([]);
  setupPropertiesEndpoints(settingsValues);

  if (isHosted || hasTransformFeature) {
    setupEnterpriseOnlyPlugin("transforms");
  }

  renderWithProviders(
    <TransformsSectionLayout>List of transforms</TransformsSectionLayout>,
    {
      storeInitialState: createMockState({
        settings,
        currentUser,
      }),
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
    it("should show allow you into transforms if transforms are enabled", async () => {
      setup({
        transformsEnabled: true,
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
      setup({ hasTransformFeature: true, transformsEnabled: true });
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
      setup({ isHosted: true, hasTransformFeature: true });
      await assertInApp();
    });
  });
});

const assertInApp = async () =>
  expect(await screen.findByText("List of transforms")).toBeInTheDocument();
const assertEnableScreen = async () =>
  expect(
    await screen.findByText("Customize and clean up your data"),
  ).toBeInTheDocument();
