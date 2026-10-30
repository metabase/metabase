import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";

import {
  TestConnectionButton,
  type TestConnectionResult,
} from "./TestConnectionButton";

const setup = ({
  result = null,
  disabled = false,
}: {
  result?: TestConnectionResult | null;
  disabled?: boolean;
} = {}) => {
  const onClick = jest.fn();
  const renderButton = (isLoading: boolean) => (
    <TestConnectionButton
      result={result}
      isLoading={isLoading}
      disabled={disabled}
      onClick={onClick}
    />
  );
  const { rerender } = render(renderButton(false));
  return {
    onClick,
    setLoading: (isLoading: boolean) => rerender(renderButton(isLoading)),
  };
};

const getButton = () =>
  screen.getByRole("button", { name: /Test connection/i });

describe("TestConnectionButton", () => {
  it("should call onClick when clicked", async () => {
    const { onClick } = setup();
    await userEvent.click(getButton());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should be disabled when disabled is set", () => {
    setup({ disabled: true });
    expect(getButton()).toBeDisabled();
  });

  it("should ignore clicks and delay the loader while loading", async () => {
    const { onClick, setLoading } = setup();
    setLoading(true);

    expect(getButton()).not.toHaveAttribute("data-loading");
    await userEvent.click(getButton());
    expect(onClick).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(getButton()).toHaveAttribute("data-loading", "true"),
    );
  });

  it("should show no result icon without a result", () => {
    setup();
    expect(
      screen.queryByLabelText("Connection successful"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Connection failed"),
    ).not.toBeInTheDocument();
  });

  it("should show the success icon for a successful result", () => {
    setup({ result: { status: "success" } });
    expect(screen.getByLabelText("Connection successful")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Connection failed"),
    ).not.toBeInTheDocument();
  });

  it("should show the error message in the failure icon's tooltip", async () => {
    setup({ result: { status: "error", message: "Wrong password" } });
    expect(
      screen.queryByLabelText("Connection successful"),
    ).not.toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("Connection failed"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Wrong password",
    );
  });
});
