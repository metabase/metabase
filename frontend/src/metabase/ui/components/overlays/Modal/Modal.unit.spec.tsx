import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";

import {
  Modal,
  type ModalRootProps,
  SIDESHEET_TRANSITION_PROPS,
} from "./index";

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

type ModalRootSetupOpts = Pick<ModalRootProps, "transitionProps">;

function ModalRootWithTrigger({ transitionProps }: ModalRootSetupOpts) {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <button onClick={() => setOpened(true)}>Open</button>
      <Modal.Root
        opened={opened}
        transitionProps={transitionProps}
        onClose={() => setOpened(false)}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Body>Modal body</Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

async function setupModalRoot({ transitionProps }: ModalRootSetupOpts = {}) {
  render(<ModalRootWithTrigger transitionProps={transitionProps} />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("dialog");
}

describe("Modal.Root", () => {
  it.each<{ name: string } & ModalRootSetupOpts>([
    { name: "with the default transition" },
    {
      name: "with a call site's own transition",
      transitionProps: { transition: "fade", duration: 200 },
    },
  ])("closes without an exit transition $name", async ({ transitionProps }) => {
    await setupModalRoot({ transitionProps });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Modal body")).not.toBeInTheDocument();
  });

  it("keeps the exit transition when a call site sets its own exitDuration", async () => {
    await setupModalRoot({ transitionProps: SIDESHEET_TRANSITION_PROPS });

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
  });

  it("returns focus to the trigger when it closes", async () => {
    await setupModalRoot();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
    );
  });
});
