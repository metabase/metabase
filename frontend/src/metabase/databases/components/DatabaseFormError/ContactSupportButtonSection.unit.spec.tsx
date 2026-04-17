import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockTokenStatus } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { ContactSupportButtonSection } from "./ContactSupportButtonSection";

interface SetupParams {
  tag?: string;
  isPaidPlan?: boolean;
}

const setup = (params?: SetupParams) => {
  const storeInitialState = createMockState({
    settings: mockSettings({
      version: { tag: params?.tag || "v1.2.3" },
      "token-status": params?.isPaidPlan
        ? createMockTokenStatus({ valid: true })
        : undefined,
    }),
  });

  renderWithProviders(
    <Route path="*" component={ContactSupportButtonSection} />,
    {
      storeInitialState,
      withRouter: true,
    },
  );
};

describe("ContactSupportButtonSection", () => {
  it("should render a troubleshooting tip with correct title and link", () => {
    setup();
    const troubleshootingTip = screen.getByTestId("troubleshooting-tip");
    expect(troubleshootingTip).toBeInTheDocument();
    expect(
      within(troubleshootingTip).getByText("Still stuck? We’re here to help"),
    ).toBeInTheDocument();
    expect(
      within(troubleshootingTip).getByRole("link", { name: "Contact Support" }),
    ).toBeInTheDocument();
  });

  describe("Help URL generation", () => {
    it("should generate free plan help URL when not on paid plan", () => {
      setup({ isPaidPlan: false });
      const contactButton = screen.getByRole("link", {
        name: "Contact Support",
      });
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1.2.3",
      );
    });

    it("should generate premium help URL when on paid plan", () => {
      setup({ isPaidPlan: true });
      const contactButton = screen.getByRole("link", {
        name: "Contact Support",
      });
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1.2.3",
      );
    });

    it("should handle different version tags in URL", () => {
      setup({ tag: "v0.50.0-beta" });
      const contactButton = screen.getByRole("link", {
        name: "Contact Support",
      });
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v0.50.0-beta",
      );
    });
  });
});
