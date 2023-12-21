import userEvent from "@testing-library/user-event";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { DashboardEmbedHeaderButton } from "./DashboardEmbedHeaderButton";

const setup = ({
  isPublicSharingEnabled = true,
  disabled = false,
  tooltip = null,
}: {
  isPublicSharingEnabled?: boolean;
  disabled?: boolean;
  tooltip?: string | null;
} = {}) => {
  const onClick = jest.fn();
  renderWithProviders(
    <DashboardEmbedHeaderButton
      onClick={onClick}
      disabled={disabled}
      tooltip={tooltip}
    />,
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

  it("should display the tooltip text when a tooltip is passed", () => {
    setup({ tooltip: "test tooltip" });
    userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("test tooltip")).toBeInTheDocument();
  });

  it("should be disabled when disabled=true", () => {
    const { onClick } = setup({ disabled: true });
    userEvent.click(screen.getByTestId("dashboard-embed-button"));

    expect(screen.getByTestId("dashboard-embed-button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should call onClick when the button is clicked", () => {
    const { onClick } = setup();
    userEvent.click(screen.getByTestId("dashboard-embed-button"));
    expect(onClick).toHaveBeenCalled();
  });
});
