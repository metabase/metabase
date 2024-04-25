import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import type { DashboardSharingEmbeddingModalProps } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
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

// Mock embedding modal as we don't need its content for the tests and causes
// some issues with routing for one or two tests.
const TestEmbeddingModalComponent = ({
  isOpen,
  onClose,
}: Pick<DashboardSharingEmbeddingModalProps, "isOpen" | "onClose">) => {
  return (
    isOpen && (
      <div>
        <button data-testid="close-embedding-modal" onClick={onClose} />
        <div data-testid="dashboard-sharing-embedding-modal" />
      </div>
    )
  );
};

jest.mock(
  "metabase/dashboard/containers/DashboardSharingEmbeddingModal",
  () => {
    return {
      __esModule: true,
      DashboardSharingEmbeddingModal: TestEmbeddingModalComponent,
    };
  },
);

const setup = ({
  isAdmin,
  hasPublicLink,
  publicLinksEnabled = false,
  embeddingEnabled = true,
}: SetupProps) => {
  const testDashboard = createMockDashboard({
    public_uuid: hasPublicLink ? "mock-uuid" : undefined,
  });

  renderWithProviders(<DashboardEmbedAction dashboard={testDashboard} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: createMockSettingsState({
        "enable-public-sharing": publicLinksEnabled,
        "enable-embedding": embeddingEnabled,
      }),
    }),
  });
};

describe("DashboardEmbedAction", () => {
  describe("which button and tooltip should be rendered", () => {
    describe("when user is admin", () => {
      it("should have a `You must enable Embedding` tooltip if embedding is disabled", async () => {
        setup({
          isAdmin: true,
          publicLinksEnabled: true,
          embeddingEnabled: false,
        });
        await userEvent.click(screen.getByLabelText("share icon"));
        expect(
          await screen.findByTestId("embed-header-menu"),
        ).toBeInTheDocument();
        expect(screen.getByText("Embedding is off")).toBeInTheDocument();
        expect(screen.getByText("Enable it in settings")).toBeInTheDocument();
      });

      it("should have a `Sharing` tooltip if public sharing is enabled", async () => {
        setup({ isAdmin: true, publicLinksEnabled: true });
        await userEvent.hover(screen.getByLabelText("share icon"));
        expect(await screen.findByText("Sharing")).toBeInTheDocument();
      });

      it("should have an `Embedding` tooltip if public sharing is disabled", async () => {
        setup({ isAdmin: true, publicLinksEnabled: false });
        await userEvent.hover(screen.getByLabelText("share icon"));
        expect(screen.getByText("Embedding")).toBeInTheDocument();
      });
    });
    describe("when user is non-admin", () => {
      it("should render button and disabled tooltip if there is no public link", async () => {
        setup({
          hasPublicLink: false,
          publicLinksEnabled: false,
          isAdmin: false,
        });

        await userEvent.hover(screen.getByLabelText("share icon"));
        expect(
          await screen.findByText("Public links are disabled"),
        ).toBeInTheDocument();
      });

      it("should render the disabled button and`Ask an admin to create a public link`", async () => {
        setup({
          hasPublicLink: false,
          isAdmin: false,
          publicLinksEnabled: true,
        });

        await userEvent.hover(screen.getByLabelText("share icon"));
        expect(
          await screen.findByText("Ask your admin to create a public link"),
        ).toBeInTheDocument();
      });

      it("should render the button if public sharing is enabled and there is a public link", () => {
        setup({
          hasPublicLink: true,
          isAdmin: false,
          publicLinksEnabled: true,
        });
        expect(screen.getByLabelText("share icon")).toBeInTheDocument();
      });
    });
  });

  describe("when the popover or modal should be rendered", () => {
    it("should render the popover when public sharing is enabled", async () => {
      setup({ publicLinksEnabled: true, isAdmin: true });
      await userEvent.click(screen.getByLabelText("share icon"));
      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();
    });

    it("should render the embedding modal and disabled public sharing item when public sharing is disabled", async () => {
      setup({ publicLinksEnabled: false, isAdmin: true });

      await userEvent.click(screen.getByLabelText("share icon"));

      expect(
        await screen.findByText("Public links are off"),
      ).toBeInTheDocument();
      expect(screen.getByText("Enable them in settings")).toBeInTheDocument();

      await userEvent.click(
        await screen.findByTestId("embed-menu-embed-modal-item"),
      );

      expect(
        await screen.findByTestId("dashboard-sharing-embedding-modal"),
      ).toBeInTheDocument();
    });

    it("should not render the embedding modal when the modal is closed", async () => {
      setup({ publicLinksEnabled: false, isAdmin: true });
      await userEvent.click(await screen.findByLabelText("share icon"));
      await userEvent.click(
        await screen.findByTestId("embed-menu-embed-modal-item"),
      );

      expect(
        await screen.findByTestId("dashboard-sharing-embedding-modal"),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId("close-embedding-modal"));

      expect(
        screen.queryByTestId("dashboard-sharing-embedding-modal"),
      ).not.toBeInTheDocument();
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
        await userEvent.click(screen.getByLabelText("share icon"));
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

        await userEvent.click(screen.getByLabelText("share icon"));

        expect(await screen.findByText("Public link")).toBeInTheDocument();
        expect(await screen.findByText("Embed")).toBeInTheDocument();
      });
    });

    // TODO: Write tests for showing the popover when the user is non-admin and a public link has/hasn't been created
  });
});
