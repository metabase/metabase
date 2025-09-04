import type React from "react";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks/settings";

import { ContactSupportButtonSection } from "./ContactSupportButtonSection";

// Mock react-router Link to properly handle href in tests
jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock child components to isolate testing
jest.mock("./TroubleshootingTip", () => ({
  TroubleshootingTip: ({
    title,
    body,
    noIcon,
    pb,
  }: {
    title: string;
    body: React.ReactNode;
    noIcon?: boolean;
    pb?: string;
  }) => (
    <div data-testid="troubleshooting-tip">
      <div data-testid="tip-title">{title}</div>
      <div data-testid="tip-body">{body}</div>
      {noIcon && <div data-testid="no-icon">true</div>}
      {pb && <div data-testid="padding-bottom">{pb}</div>}
    </div>
  ),
}));

describe("ContactSupportButtonSection", () => {
  const defaultState = createMockState({
    settings: createMockSettingsState({
      "show-metabase-links": true,
      version: { tag: "v1.0.0" },
      "is-hosted?": false,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("should render the troubleshooting tip with correct title", () => {
      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByTestId("troubleshooting-tip")).toBeInTheDocument();
      // Use the test ID since the text is clearly visible in the DOM
      expect(screen.getByTestId("tip-title")).toBeInTheDocument();
    });

    it("should render with noIcon prop", () => {
      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByTestId("no-icon")).toHaveTextContent("true");
    });

    it("should render with correct padding bottom", () => {
      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByTestId("padding-bottom")).toHaveTextContent("xl");
    });

    it("should render the contact support button", () => {
      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByText("Contact Support")).toBeInTheDocument();
    });
  });

  describe("Help URL generation", () => {
    it("should generate free plan help URL when not on paid plan", () => {
      const freeState = createMockState({
        settings: createMockSettingsState({
          "show-metabase-links": true,
          version: { tag: "v1.2.3" },
          "is-hosted?": false,
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: freeState,
      });

      const contactButton = screen.getByText("Contact Support").closest("a");
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1.2.3",
      );
    });

    it("should generate premium help URL when on paid plan", () => {
      const paidState = createMockState({
        settings: createMockSettingsState({
          "show-metabase-links": true,
          version: { tag: "v1.2.3" },
          "is-hosted?": false,
          "token-status": createMockTokenStatus({ valid: true }),
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: paidState,
      });

      const contactButton = screen.getByText("Contact Support").closest("a");
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1.2.3",
      );
    });

    it("should handle different version tags in URL", () => {
      const betaState = createMockState({
        settings: createMockSettingsState({
          "show-metabase-links": true,
          version: { tag: "v0.50.0-beta" },
          "is-hosted?": false,
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<ContactSupportButtonSection />, {
        storeInitialState: betaState,
      });

      const contactButton = screen.getByText("Contact Support").closest("a");
      expect(contactButton).toHaveAttribute(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v0.50.0-beta",
      );
    });
  });
});
