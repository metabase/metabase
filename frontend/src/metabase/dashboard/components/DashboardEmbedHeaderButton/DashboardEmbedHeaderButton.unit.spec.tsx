import userEvent from "@testing-library/user-event";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { DashboardEmbedHeaderButton } from "./DashboardEmbedHeaderButton";

const setup = ({ isPublicSharingEnabled = true, disabled = false } = {}) => {
  const onClick = jest.fn();
  renderWithProviders(
    <DashboardEmbedHeaderButton onClick={onClick} disabled={disabled} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState({
          "enable-public-sharing": isPublicSharingEnabled,
        }),
      }),
    },
  );
  return { onClick };
};

describe("DashboardEmbedHeaderButton", () => {
  it('should render "Sharing" label when public sharing is enabled', () => {
    setup({ isPublicSharingEnabled: true });
    userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("Sharing")).toBeInTheDocument();
  });

  it('should render "Embedding" label when public sharing is disabled', () => {
    setup({ isPublicSharingEnabled: false });
    userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("Embedding")).toBeInTheDocument();
  });

  it('should render "You must enable Embedding" label when the button is disabled', () => {
    setup({ disabled: true });
    userEvent.hover(screen.getByLabelText("share icon"));
    expect(
      screen.getByText("You must enable Embedding in the settings"),
    ).toBeInTheDocument();
  });

  it("should call onClick when the button is clicked", () => {
    const { onClick } = setup();

    userEvent.click(screen.getByLabelText("share icon"));

    expect(onClick).toHaveBeenCalled();
  });
});
