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
  it('should render "Sharing" label when public sharing is enabled', async () => {
    setup({ isPublicSharingEnabled: true });
    await userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("Sharing")).toBeInTheDocument();
  });

  it('should render "Embedding" label when public sharing is disabled', async () => {
    setup({ isPublicSharingEnabled: false });
    await userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("Embedding")).toBeInTheDocument();
  });

  it("should display the tooltip text when a tooltip is passed", async () => {
    setup({ tooltip: "test tooltip" });
    await userEvent.hover(screen.getByLabelText("share icon"));
    expect(screen.getByText("test tooltip")).toBeInTheDocument();
  });

  it("should be disabled when disabled=true", async () => {
    const { onClick } = setup({ disabled: true });
    await userEvent.click(screen.getByTestId("resource-embed-button"));

    expect(screen.getByTestId("resource-embed-button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should call onClick when the button is clicked", async () => {
    const { onClick } = setup();
    await userEvent.click(screen.getByTestId("resource-embed-button"));
    expect(onClick).toHaveBeenCalled();
  });
});
