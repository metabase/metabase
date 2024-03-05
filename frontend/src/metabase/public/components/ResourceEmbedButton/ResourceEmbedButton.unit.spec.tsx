import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { ResourceEmbedButton } from "./ResourceEmbedButton";

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
    <ResourceEmbedButton
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

describe("ResourceEmbedButton", () => {
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
    userEvent.click(screen.getByTestId("resource-embed-button"));

    expect(screen.getByTestId("resource-embed-button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should call onClick when the button is clicked", () => {
    const { onClick } = setup();
    userEvent.click(screen.getByTestId("resource-embed-button"));
    expect(onClick).toHaveBeenCalled();
  });
});
