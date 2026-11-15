import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { ConfirmModal } from "./ConfirmModal";

const SECONDARY_TEXT_COLOR = "var(--mantine-color-text-secondary-text)";

interface SetupOpts {
  confirmButtonText?: string;
  message?: ReactNode;
}

const setup = ({
  confirmButtonText,
  message = "This cannot be undone.",
}: SetupOpts = {}) => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <ConfirmModal
      opened
      title="Remove this provider?"
      message={message}
      confirmButtonText={confirmButtonText}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );

  return { onConfirm, onClose };
};

describe("ConfirmModal", () => {
  it("confirms when pressing enter instead of dismissing the modal", async () => {
    const { onConfirm, onClose } = setup({ confirmButtonText: "Remove" });

    await userEvent.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when pressing escape", async () => {
    const { onConfirm, onClose } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms when clicking the confirm button", async () => {
    const { onConfirm } = setup({ confirmButtonText: "Remove" });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it("shows a plain-string message in secondary text", () => {
    setup({ message: "This cannot be undone." });

    expect(screen.getByText("This cannot be undone.")).toHaveStyle({
      color: SECONDARY_TEXT_COLOR,
    });
  });

  it("keeps the default text colour for a JSX message", () => {
    setup({ message: <>This cannot be undone.</> });

    expect(screen.getByText("This cannot be undone.")).not.toHaveStyle({
      color: SECONDARY_TEXT_COLOR,
    });
  });
});
