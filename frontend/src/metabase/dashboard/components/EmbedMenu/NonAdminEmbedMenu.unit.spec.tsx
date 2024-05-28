import userEvent from "@testing-library/user-event";

import { setupDashboardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { NonAdminEmbedMenu } from "metabase/dashboard/components/EmbedMenu/NonAdminEmbedMenu";
import { createMockDashboard } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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
    <NonAdminEmbedMenu
      resource={TEST_DASHBOARD}
      resourceType="dashboard"
      hasPublicLink={hasPublicLink}
      onModalOpen={onModalOpen}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "enable-public-sharing": isPublicSharingEnabled,
          "enable-embedding": isEmbeddingEnabled,
        }),
      }),
    },
  );
};

describe("NonAdminEmbedMenu", () => {
  describe("when public sharing is enabled and public link exists", () => {
    beforeEach(() => {
      setup();
    });

    it("should render a button with a `Sharing` tooltip", async () => {
      await userEvent.hover(screen.getByLabelText("share icon"));
      expect(screen.getByText("Sharing")).toBeInTheDocument();
    });

    it("should render the public link dropdown when clicked", async () => {
      await userEvent.click(screen.getByLabelText("share icon"));

      expect(
        await screen.findByTestId("public-link-popover-content"),
      ).toBeInTheDocument();

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(
        screen.getByText("Anyone can view this if you give them the link."),
      ).toBeInTheDocument();
      expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
        /public\/dashboard\/mock-uuid/,
      );
      expect(screen.getByTestId("copy-button")).toBeInTheDocument();

      expect(
        screen.queryByText("Remove this public link"),
      ).not.toBeInTheDocument();
    });
  });

  describe("when public sharing is enabled and public link doesn't exist", () => {
    beforeEach(() => {
      setup({ hasPublicLink: false });
    });

    it("should render a disabled button with a `Ask your admin to create a public link` tooltip", async () => {
      await userEvent.hover(screen.getByLabelText("share icon"));
      expect(
        screen.getByText("Ask your admin to create a public link"),
      ).toBeInTheDocument();
    });
  });

  describe("when public sharing is disabled", () => {
    beforeEach(() => {
      setup({ isPublicSharingEnabled: false });
    });

    it("should render a disabled button with a `Public links are disabled` tooltip", async () => {
      await userEvent.hover(screen.getByLabelText("share icon"));
      expect(screen.getByText("Public links are disabled")).toBeInTheDocument();
    });
  });
});
