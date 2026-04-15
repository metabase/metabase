import { act } from "@testing-library/react";
import { useRef } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import {
  ActionButton,
  type ActionButtonHandle,
  type ActionButtonProps,
} from "./ActionButton";

const setup = async (props: Partial<ActionButtonProps> = {}) => {
  const actionFn = jest.fn().mockResolvedValue(undefined);

  const defaultProps: ActionButtonProps = {
    actionFn,
    ...props,
  };

  renderWithProviders(<ActionButton {...defaultProps} />);

  return { actionFn };
};

const setupWithRef = async (props: Partial<ActionButtonProps> = {}) => {
  const actionFn = jest.fn().mockResolvedValue(undefined);
  let resetStateFn: (() => void) | null = null;

  const TestComponent = () => {
    const ref = useRef<ActionButtonHandle>(null);

    resetStateFn = () => ref.current?.resetState();

    return <ActionButton ref={ref} actionFn={actionFn} {...props} />;
  };

  renderWithProviders(<TestComponent />);

  return {
    actionFn,
    resetState: () => resetStateFn?.(),
  };
};

describe("ActionButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render with default normalText", async () => {
    await setup({});

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("should render with custom normalText", async () => {
    await setup({ normalText: "Submit" });

    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("should render children instead of normalText when provided", async () => {
    await setup({ children: <span>Custom Button</span> });

    expect(screen.getByText("Custom Button")).toBeInTheDocument();
  });

  it("should handle successful action flow", async () => {
    const { actionFn } = await setup({
      normalText: "Save",
      activeText: "Saving...",
      successText: "Saved!",
    });

    const button = screen.getByRole("button");
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "idle");

    act(() => {
      button.click();
    });

    expect(await screen.findByText("Saving...")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "pending");
    expect(actionFn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
    expect(screen.getByLabelText("check icon")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "success");

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByText("Save")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "idle");
  });

  it("should handle successful action flow with loading spinner", async () => {
    const { actionFn } = await setup({
      useLoadingSpinner: true,
    });

    const button = screen.getByRole("button");

    act(() => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });
    expect(actionFn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("should handle failed action flow", async () => {
    const actionFn = jest.fn().mockRejectedValue(new Error("Test error"));
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await setup({
      actionFn,
      normalText: "Save",
      activeText: "Saving...",
      failedText: "Failed!",
    });

    const button = screen.getByRole("button");

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "idle");

    act(() => {
      button.click();
    });

    expect(await screen.findByText("Saving...")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "pending");
    expect(actionFn).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("Failed!")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "failed");
    expect(consoleErrorSpy).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByText("Save")).toBeInTheDocument();
    expect(button).toHaveAttribute("data-action-status", "idle");

    consoleErrorSpy.mockRestore();
  });

  it("should reset state when resetState is called via ref and clear timeout", async () => {
    const { resetState } = await setupWithRef({});

    const button = screen.getByRole("button");
    act(() => {
      button.click();
    });

    expect(await screen.findByText("Saved")).toBeInTheDocument();

    act(() => {
      resetState();
      jest.advanceTimersByTime(5000);
    });

    // Should be back to normal state immediately, and stay there even after timer would have fired
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should cancel promise on unmount", async () => {
    const actionFn = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        setTimeout(resolve, 10000);
      }),
    );

    const { unmount } = renderWithProviders(
      <ActionButton actionFn={actionFn} />,
    );

    const button = screen.getByRole("button");
    button.click();

    unmount();

    expect(actionFn).toHaveBeenCalled();
  });
});
