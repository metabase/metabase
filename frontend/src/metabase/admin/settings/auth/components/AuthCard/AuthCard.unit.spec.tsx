import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockSettingDefinition } from "metabase-types/api/mocks";

import type { AuthSetting, AuthCardProps } from "./AuthCard";
import AuthCard from "./AuthCard";

describe("AuthCard", () => {
  it("should render when not configured", () => {
    const props = getProps({
      isConfigured: false,
    });

    render(<AuthCard {...props} />);

    expect(screen.getByText("Set up")).toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should pause active authentication", async () => {
    const props = getProps({
      setting: getSetting({ value: true }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Pause"));

    expect(props.onChange).toHaveBeenCalledWith(false);
  });

  it("should resume paused authentication", async () => {
    const props = getProps({
      setting: getSetting({ value: false }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Resume"));

    expect(props.onChange).toHaveBeenCalledWith(true);
  });

  it("should deactivate authentication", async () => {
    const props = getProps({
      setting: getSetting({ value: false }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByText("Deactivate"));
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(props.onDeactivate).toHaveBeenCalled();
  });

  it("should handle settings set with env vars", () => {
    const props = getProps({
      setting: getSetting({
        value: null,
        env_name: "MB_JWT_ENABLED",
        is_env_setting: true,
      }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);

    expect(screen.getByRole("link")).toHaveTextContent("$MB_JWT_ENABLED");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("card-badge")).not.toBeInTheDocument();
  });
});

const getSetting = (opts?: Partial<AuthSetting>): AuthSetting =>
  createMockSettingDefinition({
    value: false,
    ...opts,
  }) as AuthSetting;

const getProps = (opts?: Partial<AuthCardProps>): AuthCardProps => ({
  setting: getSetting(),
  type: "type",
  name: "SSO",
  description: "SSO authentication",
  isConfigured: false,
  onChange: jest.fn(),
  onDeactivate: jest.fn(),
  ...opts,
});
