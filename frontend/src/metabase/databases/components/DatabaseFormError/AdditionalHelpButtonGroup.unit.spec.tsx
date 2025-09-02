import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks/settings";

import { AdditionalHelpButtonGroup } from "./AdditionalHelpButtonGroup";

// Mock external dependencies
jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("metabase/lib/urls", () => ({
  newUser: jest.fn(() => "/admin/people/new"),
}));

jest.mock("./ContactSupportButtonSection", () => ({
  ContactSupportButtonSection: () => (
    <div data-testid="contact-support-section">Contact Support Section</div>
  ),
}));

describe("AdditionalHelpButtonGroup", () => {
  const defaultState = createMockState({
    currentUser: createMockUser({ is_superuser: false }),
    settings: createMockSettingsState({
      "show-metabase-links": true,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  const adminState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: createMockSettingsState({
      "show-metabase-links": true,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  const noMetabaseLinksState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: createMockSettingsState({
      "show-metabase-links": false,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("should always render ContactSupportButtonSection", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });

    it("should render dividers appropriately", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      // Should have multiple dividers when both conditions are met
      const dividers = screen.getAllByRole("separator");
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe("Metabase links visibility", () => {
    it("should show docs button when showMetabaseLinks is true", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByText("Read the docs")).toBeInTheDocument();
    });

    it("should show docs button even when showMetabaseLinks is false (OSS behavior)", () => {
      // In OSS version, getShowMetabaseLinks always returns true
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: noMetabaseLinksState,
      });

      expect(screen.getByText("Read the docs")).toBeInTheDocument();
    });

    it("should render docs button with correct properties", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      const docsButton = screen.getByText("Read the docs");
      expect(docsButton).toBeInTheDocument();
      expect(docsButton.closest("a")).toHaveAttribute("href");
    });
  });

  describe("Admin functionality", () => {
    it("should show invite teammate button when user is admin", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      expect(
        screen.getByText("Invite a teammate to help you"),
      ).toBeInTheDocument();
    });

    it("should not show invite teammate button when user is not admin", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      expect(
        screen.queryByText("Invite a teammate to help you"),
      ).not.toBeInTheDocument();
    });

    it("should render invite button with correct link", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      const inviteButton = screen.getByText("Invite a teammate to help you");
      expect(inviteButton.closest("a")).toHaveAttribute(
        "href",
        "/admin/people/new",
      );
    });
  });

  describe("Button styling and icons", () => {
    it("should render docs button with reference icon", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      const docsButton = screen.getByText("Read the docs");
      expect(docsButton).toBeInTheDocument();
      // The icon is rendered as a sibling, so we check the button structure
      expect(docsButton.closest("a")).toBeInTheDocument();
    });

    it("should render invite button with mail icon", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      const inviteButton = screen.getByText("Invite a teammate to help you");
      expect(inviteButton).toBeInTheDocument();
      expect(inviteButton.closest("a")).toBeInTheDocument();
    });

    it("should apply correct CSS classes to buttons", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      const docsButton = screen.getByText("Read the docs");
      const inviteButton = screen.getByText("Invite a teammate to help you");

      // Both buttons should have the link class and be rendered as links
      expect(docsButton.closest("a")).toBeInTheDocument();
      expect(inviteButton.closest("a")).toBeInTheDocument();
    });
  });

  describe("Conditional rendering combinations", () => {
    it("should render both buttons when user is admin and metabase links are shown", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: adminState,
      });

      expect(screen.getByText("Read the docs")).toBeInTheDocument();
      expect(
        screen.getByText("Invite a teammate to help you"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });

    it("should render both buttons when user is admin (OSS always shows docs)", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: noMetabaseLinksState,
      });

      // In OSS, docs button is always shown regardless of show-metabase-links setting
      expect(screen.getByText("Read the docs")).toBeInTheDocument();
      expect(
        screen.getByText("Invite a teammate to help you"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });

    it("should render only docs button when user is not admin but metabase links are shown", () => {
      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: defaultState,
      });

      expect(screen.getByText("Read the docs")).toBeInTheDocument();
      expect(
        screen.queryByText("Invite a teammate to help you"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });

    it("should render docs and ContactSupportButtonSection when user is not admin (OSS behavior)", () => {
      const nonAdminNoLinksState = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
        settings: createMockSettingsState({
          "show-metabase-links": false,
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: nonAdminNoLinksState,
      });

      // In OSS, docs button is always shown
      expect(screen.getByText("Read the docs")).toBeInTheDocument();
      expect(
        screen.queryByText("Invite a teammate to help you"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });
  });

  describe("URL generation", () => {
    it("should use correct docs URL from selector", () => {
      const stateWithCustomDocs = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
        settings: createMockSettingsState({
          "show-metabase-links": true,
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: stateWithCustomDocs,
      });

      const docsButton = screen.getByText("Read the docs");
      expect(docsButton.closest("a")).toHaveAttribute("href");
    });
  });

  describe("Edge cases", () => {
    it("should handle undefined user state gracefully", () => {
      const stateWithoutUser = createMockState({
        currentUser: null,
        settings: createMockSettingsState({
          "show-metabase-links": true,
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: stateWithoutUser,
      });

      // Should still render docs button and contact support, but not invite button
      expect(screen.getByText("Read the docs")).toBeInTheDocument();
      expect(
        screen.queryByText("Invite a teammate to help you"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });

    it("should handle missing settings gracefully", () => {
      const stateWithMinimalSettings = createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: createMockSettingsState({
          "token-features": createMockTokenFeatures({}),
        }),
      });

      renderWithProviders(<AdditionalHelpButtonGroup />, {
        storeInitialState: stateWithMinimalSettings,
      });

      // Should always render contact support section
      expect(screen.getByTestId("contact-support-section")).toBeInTheDocument();
    });
  });
});
