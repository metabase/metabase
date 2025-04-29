import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type { AuthCardProps } from "./AuthCard";
import { AuthCard } from "./AuthCard";

describe("AuthCard", () => {
  it("should render when not configured", () => {
    const props = getProps({
      isConfigured: false,
    });

    renderWithProviders(<AuthCard {...props} />);

    expect(screen.getByText("Set up")).toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should pause active authentication", async () => {
    const props = getProps({
      isEnabled: true,
      isConfigured: true,
    });

    renderWithProviders(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Pause"));

    expect(props.onChange).toHaveBeenCalledWith(false);
  });

  it("should resume paused authentication", async () => {
    const props = getProps({
      isEnabled: false,
      isConfigured: true,
    });

    renderWithProviders(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Resume"));

    expect(props.onChange).toHaveBeenCalledWith(true);
  });

  it("should deactivate authentication", async () => {
    const props = getProps({
      isEnabled: false,
      isConfigured: true,
    });

    renderWithProviders(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Deactivate"));
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(props.onDeactivate).toHaveBeenCalled();
  });

  it("should handle settings set with env vars", () => {
    const props = getProps({
      setting: {
        env_name: "MB_JWT_ENABLED",
        is_env_setting: true,
      },
      isConfigured: true,
    });

    renderWithProviders(<AuthCard {...props} />);

    expect(screen.getByRole("link")).toHaveTextContent("$MB_JWT_ENABLED");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("card-badge")).not.toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<AuthCardProps>): AuthCardProps => ({
  setting: {
    is_env_setting: false,
    env_name: "MY_VAR",
  },
  type: "type",
  name: "SSO",
  description: "SSO authentication",
  isConfigured: false,
  isEnabled: false,
  onChange: jest.fn(),
  onDeactivate: jest.fn(),
  ...opts,
});
