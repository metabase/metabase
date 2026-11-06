import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { render, screen, within } from "__support__/ui";

import { Modal } from "./index";

interface SetupOpts {
  headerActions?: ReactNode;
}

const setup = ({ headerActions }: SetupOpts = {}) => {
  const onBack = jest.fn<void, []>();
  const onClose = jest.fn<void, []>();

  render(
    <Modal
      opened
      title="Static embedding"
      headerActions={headerActions}
      onBack={onBack}
      onClose={onClose}
    >
      Body
    </Modal>,
  );

  return { onBack, onClose };
};

describe("Modal", () => {
  it("should keep the body mounted when the Back button appears", async () => {
    const { rerender } = render(
      <Modal opened title="Embed this question" onClose={jest.fn<void, []>()}>
        <input aria-label="Name" />
      </Modal>,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Orders");

    rerender(
      <Modal
        opened
        title="Static embedding"
        onBack={jest.fn<void, []>()}
        onClose={jest.fn<void, []>()}
      >
        <input aria-label="Name" />
      </Modal>,
    );

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Orders");
  });

  it("should go back from the Back button and the title, keeping the title as the modal's name", async () => {
    const { onBack, onClose } = setup();

    expect(
      screen.getByRole("dialog", { name: "Static embedding" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("heading", { name: "Static embedding" }),
    );
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should put header actions between the Back and Close buttons, and close without going back", async () => {
    const { onBack, onClose } = setup({
      headerActions: <button>Edit this action</button>,
    });

    const dialog = screen.getByRole("dialog", { name: "Static embedding" });
    expect(
      within(dialog)
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent,
        ),
    ).toEqual(["Back", "Edit this action", "Close"]);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });
});
