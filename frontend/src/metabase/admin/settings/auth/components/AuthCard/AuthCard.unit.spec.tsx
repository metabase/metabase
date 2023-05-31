import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthCard, { AuthSetting, AuthCardProps } from "./AuthCard";

describe("AuthCard", () => {
  it("should render when not configured", () => {
    const props = getProps({
      isConfigured: false,
    });

    render(<AuthCard {...props} />);

    expect(screen.getByText("Set up")).toBeInTheDocument();
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should pause active authentication", () => {
    const props = getProps({
      setting: getSetting({ value: true }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Pause"));

    expect(props.onChange).toHaveBeenCalledWith(false);
  });

  it("should resume paused authentication", () => {
    const props = getProps({
      setting: getSetting({ value: false }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Resume"));

    expect(props.onChange).toHaveBeenCalledWith(true);
  });

  it("should deactivate authentication", () => {
    const props = getProps({
      setting: getSetting({ value: false }),
      isConfigured: true,
    });

    render(<AuthCard {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Deactivate"));
    userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(props.onDeactivate).toHaveBeenCalled();
  });
});

const getSetting = (opts?: Partial<AuthSetting>): AuthSetting => ({
  value: false,
  ...opts,
});

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
