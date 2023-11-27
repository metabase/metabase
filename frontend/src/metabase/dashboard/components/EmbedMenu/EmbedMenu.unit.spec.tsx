import userEvent from "@testing-library/user-event";
import { EmbedMenu } from "metabase/dashboard/components/EmbedMenu/EmbedMenu";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCard,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
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
const TestEmbeddingModalComponent = () => {
  return <div data-testid="dashboard-sharing-embedding-modal" />;
};

jest.mock(
  "metabase/dashboard/containers/DashboardSharingEmbeddingModal",
  () => {
    return {
      __esModule: true,
      default: TestEmbeddingModalComponent,
    };
  },
);

const TEST_DASHBOARD = createMockDashboard();

const setup = ({
  isAdmin,
  hasPublicLink = false,
  publicLinksEnabled = false,
}: SetupProps) => {
  const onModalOpen = jest.fn();
  renderWithProviders(
    <EmbedMenu
      resource={TEST_DASHBOARD}
      resourceType="dashboard"
      hasPublicLink={hasPublicLink}
      onModalOpen={onModalOpen}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState({
          "enable-public-sharing": publicLinksEnabled,
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
  });

  describe("whether the button should be rendered", () => {
    describe("when the user is admin", () => {
      it("should render the button even if there is no public link", () => {
        setup({ isAdmin: true, hasPublicLink: false });
        expect(screen.getByLabelText("share icon")).toBeInTheDocument();
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

      it("should render the button if there is a public link", () => {
        setup({
          hasPublicLink: true,
          isAdmin: false,
          publicLinksEnabled: true,
        });
        expect(screen.getByLabelText("share icon")).toBeInTheDocument();
      })
    });
  });

  describe("when the popover or modal should be rendered", () => {
    it("should render the popover when public sharing is true", async () => {
      setup({ publicLinksEnabled: true, isAdmin: true });
      userEvent.click(screen.getByLabelText("share icon"));
      expect(
        await screen.findByTestId("embed-header-menu"),
      ).toBeInTheDocument();
    });

    it("should render the embedding modal when public sharing is false", async () => {
      setup({ publicLinksEnabled: false, isAdmin: true });
      userEvent.click(await screen.findByLabelText("share icon"));

      expect(
        await screen.findByTestId("dashboard-sharing-embedding-modal"),
      ).toBeInTheDocument();
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
        userEvent.click(screen.getByLabelText("share icon"));
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

        userEvent.click(screen.getByLabelText("share icon"));

        expect(await screen.findByText("Public link")).toBeInTheDocument();
        expect(await screen.findByText("Embed")).toBeInTheDocument();
      });
    });

    describe("when user is non-admin", () => {
      it("should render not render the button if a link hasn't been created", async () => {
        setup({
          hasPublicLink: false,
          publicLinksEnabled: true,
          isAdmin: false,
        });
        expect(screen.queryByLabelText("share icon")).not.toBeInTheDocument();
      });

      it("should render the public link popover immediately on button click if a public link has been created", async () => {
        setup({
          hasPublicLink: true,
          publicLinksEnabled: true,
          isAdmin: false,
        });

        userEvent.click(screen.getByLabelText("share icon"));

        expect(await screen.findByText("Public link")).toBeInTheDocument();
      });
    })

    // TODO: Write tests for showing the popover when the user is non-admin and a public link has/hasn't been created
  });
});
