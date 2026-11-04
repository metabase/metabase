import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "__support__/ui";

import {
  Modal,
  type ModalRootProps,
  SIDESHEET_TRANSITION_PROPS,
} from "./index";

type SetupOpts = Pick<ModalRootProps, "transitionProps">;

function ModalRootWithTrigger({ transitionProps }: SetupOpts) {
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

async function setup({ transitionProps }: SetupOpts = {}) {
  render(<ModalRootWithTrigger transitionProps={transitionProps} />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("dialog");
}

describe("Modal.Root", () => {
  it.each<{ name: string } & SetupOpts>([
    { name: "with the default transition" },
    {
      name: "with a call site's own transition",
      transitionProps: { transition: "fade", duration: 200 },
    },
  ])("closes without an exit transition $name", async ({ transitionProps }) => {
    await setup({ transitionProps });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Modal body")).not.toBeInTheDocument();
  });

  it("keeps the exit transition when a call site sets its own exitDuration", async () => {
    await setup({ transitionProps: SIDESHEET_TRANSITION_PROPS });

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
  });

  it("returns focus to the trigger when it closes", async () => {
    await setup();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
    );
  });
});
