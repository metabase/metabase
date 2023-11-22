import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { DashboardEmbedHeaderMenu } from "./DashboardEmbedHeaderMenu";

describe("DashboardEmbedHeaderMenu", () => {
  const setup = ({
    hasPublicLink = false,
    isPublicSharingEnabled = true,
    isAdmin = false,
  } = {}) => {
    const openPublicLinkPopover = jest.fn();
    const openEmbedModal = jest.fn();

    const TEST_USER = createMockUser({
      is_superuser: isAdmin,
    });

    const target = <button data-testid="target" />;

    renderWithProviders(
      <DashboardEmbedHeaderMenu
        hasPublicLink={hasPublicLink}
        target={target}
        openPublicLinkPopover={openPublicLinkPopover}
        openEmbedModal={openEmbedModal}
      />,
      {
        storeInitialState: createMockState({
          currentUser: TEST_USER,
          settings: createMockSettingsState({
            "enable-public-sharing": isPublicSharingEnabled,
          }),
        }),
      },
    );

    return { openPublicLinkPopover, openEmbedModal };
  };

  it('should render "Create a public link" option when admin and public sharing enabled with no public link', async () => {
    setup({
      hasPublicLink: false,
      isPublicSharingEnabled: true,
      isAdmin: true,
    });

    userEvent.click(screen.getByTestId("target"));

    expect(await screen.findByText("Create a public link")).toBeInTheDocument();
  });

  it('should render "Public link" option when admin and public sharing enabled with existing public link', async () => {
    setup({ hasPublicLink: true, isPublicSharingEnabled: true, isAdmin: true });

    userEvent.click(screen.getByTestId("target"));

    expect(await screen.findByText("Public link")).toBeInTheDocument();
  });

  it('should call openPublicLinkPopover when "Create a public link" option is clicked', async () => {
    const { openPublicLinkPopover } = setup({
      hasPublicLink: false,
      isPublicSharingEnabled: true,
      isAdmin: true,
    });

    userEvent.click(screen.getByTestId("target"));

    userEvent.click(await screen.findByText("Create a public link"));

    expect(openPublicLinkPopover).toHaveBeenCalledTimes(1);
  });

  it('should call openEmbedModal when "Embed" option is clicked', async () => {
    const { openEmbedModal } = setup({
      isAdmin: true,
      isPublicSharingEnabled: true,
    });
    userEvent.click(screen.getByTestId("target"));

    userEvent.click(await screen.findByText("Embed"));
    expect(openEmbedModal).toHaveBeenCalledTimes(1);
  });
});
