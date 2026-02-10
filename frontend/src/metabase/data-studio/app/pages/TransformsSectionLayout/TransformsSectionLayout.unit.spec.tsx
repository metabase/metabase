import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupStoreEEBillingEndpoint,
  setupStoreEECloudAddOnsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TransformsSectionLayout } from "./TransformsSectionLayout";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => "App Switcher",
}));

const setup = ({
  isHosted = false,
  hasTransformFeature = false,
  transformsEnabled = false,
  isAdmin = false,
}: {
  isHosted?: boolean;
  hasTransformFeature?: boolean;
  transformsEnabled?: boolean;
  isAdmin?: boolean;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      transforms: hasTransformFeature,
      hosting: isHosted,
    }),
    "transforms-enabled": transformsEnabled,
    "is-hosted?": isHosted,
  });

  if (isHosted || hasTransformFeature) {
    setupEnterpriseOnlyPlugin("transforms");
  }

  renderWithProviders(
    <TransformsSectionLayout>List of transforms</TransformsSectionLayout>,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: isAdmin }),
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
      setup({ isHosted: true });
      await assertDataStudioUpsellPage();
    });

    it("should show you an upsell page if you are hosted and the transform feature is not present, even when transforms are enabled on the instance", async () => {
      setup({ isHosted: true, transformsEnabled: true });
      await assertDataStudioUpsellPage();
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

const assertDataStudioUpsellPage = async () =>
  expect(
    await screen.findByText("Start transforming your data in Metabase"),
  ).toBeInTheDocument();
