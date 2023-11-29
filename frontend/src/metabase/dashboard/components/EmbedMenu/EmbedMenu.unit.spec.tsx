import userEvent from "@testing-library/user-event";
import { EmbedMenu } from "metabase/dashboard/components/EmbedMenu/EmbedMenu";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

interface SetupProps {
  isAdmin: boolean;
  hasPublicLink?: boolean;
  editing?: boolean;
  embeddingEnabled?: boolean;
  fullscreen?: boolean;
  linkEnabled?: boolean;
  publicLinksEnabled?: boolean;
}

const setup = ({
  isAdmin,
  hasPublicLink = false,
  publicLinksEnabled = false,
  embeddingEnabled = true,
}: SetupProps) => {
  const onModalOpen = jest.fn();
  renderWithProviders(
    <EmbedMenu
      resource={createMockDashboard({
        public_uuid: hasPublicLink ? "mock-uuid" : null,
      })}
      resourceType="dashboard"
      hasPublicLink={hasPublicLink}
      onModalOpen={onModalOpen}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState({
          "enable-public-sharing": publicLinksEnabled,
          "enable-embedding": embeddingEnabled,
        }),
      }),
    },
  );

  return {
    onModalOpen,
  };
};

describe("EmbedMenu", () => {
  describe("which label should be rendered", () => {
    it("should have a `Sharing` tooltip if public sharing is true", () => {
      setup({ isAdmin: true, publicLinksEnabled: true });
      userEvent.hover(screen.getByLabelText("share icon"));
      expect(screen.getByText("Sharing")).toBeInTheDocument();
    });

    it("should have an `Embedding` tooltip if public sharing is false", () => {
      setup({ isAdmin: true, publicLinksEnabled: false });
      userEvent.hover(screen.getByLabelText("share icon"));
      expect(screen.getByText("Embedding")).toBeInTheDocument();
    });

    it("should have a `enable embedding in settings` message if embedding is disabled", async () => {
      setup({ isAdmin: true, embeddingEnabled: false });
      userEvent.hover(screen.getByLabelText("share icon"));
      expect(
        await screen.findByText("You must enable Embedding in the settings"),
      ).toBeInTheDocument();
    });
  });

  describe("whether the button should be rendered", () => {
    describe("when the user is admin", () => {
      it("should render the button even if there is no public link", () => {
        setup({ isAdmin: true, hasPublicLink: false });
        expect(
          screen.getByTestId("dashboard-embed-button"),
        ).toBeInTheDocument();
      });

      it("should render a disabled button if embedding is disabled", () => {
        setup({
          isAdmin: true,
          embeddingEnabled: false,
        });
        expect(screen.getByTestId("dashboard-embed-button")).toBeDisabled();
      });
    });

    describe("when the user is non-admin", () => {
      it("should not render the button if there is no public link", () => {
        setup({
          hasPublicLink: false,
          publicLinksEnabled: false,
          isAdmin: false,
        });
        expect(screen.queryByLabelText("share icon")).not.toBeInTheDocument();
      });

      it("should not render the button if public sharing is enabled but no public link", () => {
        setup({
          hasPublicLink: false,
          isAdmin: false,
          publicLinksEnabled: true,
        });
        expect(screen.queryByLabelText("share icon")).not.toBeInTheDocument();
      });

      // TODO: Test for rendering button for non-admins when a public link is created
    });
  });

  describe("when the popover or modal should be rendered", () => {
    it("should render the popover when public sharing is true", async () => {
      setup({ publicLinksEnabled: true, isAdmin: true });
      userEvent.click(screen.getByTestId("dashboard-embed-button"));
      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();
    });

    it("should call `onModalOpen` immediately when public sharing is false", async () => {
      const { onModalOpen } = setup({
        publicLinksEnabled: false,
        isAdmin: true,
      });
      userEvent.click(screen.getByLabelText("share icon"));

      expect(onModalOpen).toHaveBeenCalled();
    });
  });

  describe("which popover content should be rendered", () => {
    describe("when user is admin", () => {
      it("should render the menu with `Create a public link` if a link hasn't been created", async () => {
        setup({
          hasPublicLink: false,
          publicLinksEnabled: true,
          isAdmin: true,
        });
        userEvent.click(screen.getByTestId("dashboard-embed-button"));
        expect(
          await screen.findByText("Create a public link"),
        ).toBeInTheDocument();
        expect(await screen.findByText("Embed")).toBeInTheDocument();
      });

      it("should render the menu with `Public link` option if a public link has been created", async () => {
        setup({
          hasPublicLink: true,
          publicLinksEnabled: true,
          isAdmin: true,
        });

        userEvent.click(screen.getByTestId("dashboard-embed-button"));

        expect(await screen.findByText("Public link")).toBeInTheDocument();
        expect(await screen.findByText("Embed")).toBeInTheDocument();
      });
    });

    // TODO: Write tests for showing the popover when the user is non-admin and a public link has/hasn't been created
  });
});
