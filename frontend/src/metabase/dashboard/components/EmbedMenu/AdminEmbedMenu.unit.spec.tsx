import userEvent from "@testing-library/user-event";

import { setupDashboardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AdminEmbedMenu } from "./AdminEmbedMenu";

const setup = ({
  hasPublicLink = true,
  isPublicSharingEnabled = true,
  isEmbeddingEnabled = true,
}: {
  hasPublicLink?: boolean;
  isPublicSharingEnabled?: boolean;
  isEmbeddingEnabled?: boolean;
} = {}) => {
  const TEST_DASHBOARD = createMockDashboard({
    public_uuid: hasPublicLink ? "mock-uuid" : null,
  });
  setupDashboardPublicLinkEndpoints(TEST_DASHBOARD.id);

  const onModalOpen = jest.fn();

  renderWithProviders(
    <AdminEmbedMenu
      resource={TEST_DASHBOARD}
      resourceType="dashboard"
      hasPublicLink={hasPublicLink}
      onModalOpen={onModalOpen}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "enable-public-sharing": isPublicSharingEnabled,
          "enable-embedding": isEmbeddingEnabled,
        }),
      }),
    },
  );

  return {
    onModalOpen,
  };
};

describe("AdminEmbedMenu", () => {
  describe("when public sharing enabled, public link exists, embedding enabled", () => {
    it("should have a `Sharing` tooltip", async () => {
      setup();
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Sharing");
    });

    it("should show `Public link` and `Embed` options", async () => {
      setup();
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embed")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });

    it("should open the public link popover when `Public link` is clicked", async () => {
      setup();
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Public link"));

      expect(
        await screen.findByTestId("public-link-popover-content"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(
        screen.getByText("Anyone can view this if you give them the link."),
      ).toBeInTheDocument();

      const inputValue = screen
        .getByTestId("public-link-input")
        .getAttribute("value");

      expect(inputValue).toMatch(/\/public\/dashboard\/mock-uuid/i);

      expect(screen.getByTestId("copy-button")).toBeInTheDocument();
      expect(screen.getByText("Remove public link")).toBeInTheDocument();
    });

    it("should open the embed modal when `Embed` is clicked", async () => {
      const { onModalOpen } = setup();
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Embed"));

      expect(onModalOpen).toHaveBeenCalled();
    });
  });

  describe("when public sharing enabled, public link doesn't exist, embedding enabled", () => {
    beforeEach(() => {
      setup({ hasPublicLink: false });
    });

    it("should have a `Sharing` tooltip", async () => {
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Sharing");
    });

    it("should show `Create a public link` and `Embed` options", async () => {
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embed")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });
  });

  describe("when public sharing enabled, public link exists, embedding disabled", () => {
    beforeEach(() => {
      setup({ isEmbeddingEnabled: false });
    });

    it("should have a `Sharing` tooltip", async () => {
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Sharing");
    });

    it("should show `Public link` and `Embed` options", async () => {
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embedding is off")).toBeInTheDocument();
      expect(screen.getByText("Enable it in settings")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });
  });

  describe("when public sharing enabled, public link doesn't exist, embedding disabled", () => {
    beforeEach(() => {
      setup({ hasPublicLink: false, isEmbeddingEnabled: false });
    });

    it("should have a `Sharing` tooltip", async () => {
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Sharing");
    });

    it("should show `Public link` and `Embed` options", async () => {
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Create a public link")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embedding is off")).toBeInTheDocument();
      expect(screen.getByText("Enable it in settings")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });
  });

  describe("when public sharing disabled, embedding enabled", () => {
    beforeEach(() => {
      setup({ isPublicSharingEnabled: false });
    });

    it("should have an `Embedding` tooltip", async () => {
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Embedding");
    });

    it("should show `Public link` and `Embed` options", async () => {
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public links are off")).toBeInTheDocument();
      expect(screen.getByText("Enable them in settings")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embed")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });
  });

  describe("when public sharing disabled, embedding disabled", () => {
    beforeEach(() => {
      setup({ isPublicSharingEnabled: false, isEmbeddingEnabled: false });
    });

    it("should have an `Embedding` tooltip", async () => {
      await userEvent.hover(screen.getByTestId("resource-embed-button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Embedding");
    });

    it("should show `Public link` and `Embed` options", async () => {
      await userEvent.click(screen.getByTestId("resource-embed-button"));

      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public links are off")).toBeInTheDocument();
      expect(screen.getByText("Enable them in settings")).toBeInTheDocument();
      expect(screen.getByLabelText("share icon")).toBeInTheDocument();

      expect(screen.getByText("Embedding is off")).toBeInTheDocument();
      expect(screen.getByText("Enable it in settings")).toBeInTheDocument();
      expect(screen.getByLabelText("embed icon")).toBeInTheDocument();
    });
  });
});
