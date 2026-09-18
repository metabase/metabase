import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { ConfirmModal } from "./ConfirmModal";

interface SetupOpts {
  confirmButtonText?: string;
}

const setup = ({ confirmButtonText }: SetupOpts = {}) => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <ConfirmModal
      opened
      title="Remove this provider?"
      message="This cannot be undone."
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
});
