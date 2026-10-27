import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettings,
  IllustrationSettingValue,
  User,
} from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { HomeLayout } from "./HomeLayout";

const CUSTOM_ILLUSTRATION_URL =
  "api/session/illustration/landing-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  currentUser?: User;
  illustration?: IllustrationSettingValue;
  customIllustrationUrl?: EnterpriseSettings["landing-page-illustration-custom"];
  hasWhitelabel?: boolean;
  showMetabot?: boolean;
}

const setup = ({
  currentUser,
  illustration,
  customIllustrationUrl = CUSTOM_ILLUSTRATION_URL,
  hasWhitelabel = false,
  showMetabot = true,
}: SetupOpts = {}) => {
  const state = createMockState({
    currentUser,
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ whitelabel: hasWhitelabel }),
      "show-metabot": showMetabot,
      "landing-page-illustration": illustration,
      "landing-page-illustration-custom": customIllustrationUrl,
    }),
  });

  // mockSettings seeds the MetabaseSettings singleton that the plugin's own
  // feature check reads, so it has to run before the plugin initializes.
  if (hasWhitelabel) {
    setupEnterpriseOnlyPlugin("whitelabel");
  }

  return renderWithProviders(<HomeLayout />, {
    storeInitialState: state,
  });
};

// The lighthouse is the only SVG left on the page once the Metabot greeting and
// the admin-only Customize button are out of the way.
const setupWithoutOtherSvgs = (opts: SetupOpts) =>
  setup({
    ...opts,
    hasWhitelabel: true,
    showMetabot: false,
    currentUser: createMockUser({ is_superuser: false }),
  });

const getLighthouse = (container: HTMLElement) =>
  container.querySelector("svg");

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup({ currentUser: createMockUser({ first_name: "Test" }) });
    expect(screen.getByText(/Test/)).toBeInTheDocument();
  });

  it("should show customize button when user is an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: true }),
    });
    expect(screen.getByText(/Customize/)).toBeInTheDocument();
  });

  it("should not show customize button when user is not an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: false }),
    });
    expect(screen.queryByText(/Customize/)).not.toBeInTheDocument();
  });

  describe("landing page illustration", () => {
    it("should show the lighthouse illustration by default", () => {
      const { container } = setupWithoutOtherSvgs({ illustration: "default" });

      expect(getLighthouse(container)).toBeInTheDocument();
      expect(
        screen.queryByTestId("landing-page-illustration"),
      ).not.toBeInTheDocument();
    });

    it("should show the custom illustration when one is uploaded", () => {
      setupWithoutOtherSvgs({ illustration: "custom" });

      expect(screen.getByTestId("landing-page-illustration")).toHaveStyle({
        backgroundImage: `url(${CUSTOM_ILLUSTRATION_URL})`,
      });
    });

    it("should show no illustration when the setting is 'none'", () => {
      const { container } = setupWithoutOtherSvgs({ illustration: "none" });

      expect(
        screen.queryByTestId("landing-page-illustration"),
      ).not.toBeInTheDocument();
      expect(getLighthouse(container)).not.toBeInTheDocument();
    });

    it("should show no illustration when 'custom' is selected but nothing is uploaded", () => {
      const { container } = setupWithoutOtherSvgs({
        illustration: "custom",
        customIllustrationUrl: "",
      });

      expect(
        screen.queryByTestId("landing-page-illustration"),
      ).not.toBeInTheDocument();
      expect(getLighthouse(container)).not.toBeInTheDocument();
    });
  });
});
