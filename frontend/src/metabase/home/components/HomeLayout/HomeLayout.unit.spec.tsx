import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { IllustrationSettingValue, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { HomeLayout } from "./HomeLayout";

jest.mock("metabase/common/components/LighthouseIllustration", () => ({
  LighthouseIllustration: () => <div data-testid="lighthouse-illustration" />,
}));

const ILLUSTRATION_URL =
  "api/session/illustration/landing-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  currentUser?: User;
  landingPageIllustration?: IllustrationSettingValue;
}

const setup = ({ currentUser, landingPageIllustration }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser,
    ...(landingPageIllustration && {
      settings: mockSettings({
        "landing-page-illustration": landingPageIllustration,
        "landing-page-illustration-custom": ILLUSTRATION_URL,
        "token-features": createMockTokenFeatures({ whitelabel: true }),
      }),
    }),
  });
  if (landingPageIllustration) {
    setupEnterpriseOnlyPlugin("whitelabel");
  }

  renderWithProviders(<HomeLayout />, {
    storeInitialState: state,
  });
};

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

  describe("EE with whitelabel", () => {
    it("should show a custom landing page illustration", () => {
      setup({ landingPageIllustration: "custom" });

      expect(screen.getByTestId("landing-page-illustration")).toHaveStyle({
        backgroundImage: `url("${ILLUSTRATION_URL}")`,
      });
    });

    it("should show the lighthouse illustration by default", () => {
      setup({ landingPageIllustration: "default" });

      expect(screen.getByTestId("lighthouse-illustration")).toBeInTheDocument();
    });

    it("should not show an illustration when it is turned off", () => {
      setup({ landingPageIllustration: "none" });

      expect(screen.getByTestId("home-page")).toBeInTheDocument();
      expect(
        screen.queryByTestId("landing-page-illustration"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("lighthouse-illustration"),
      ).not.toBeInTheDocument();
    });
  });
});
