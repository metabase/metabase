import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { render, screen, waitFor } from "__support__/ui";
import {
  Autocomplete,
  Button,
  Menu,
  Modal,
  Popover,
  Select,
} from "metabase/ui";

const OVERLAY_TESTID = "modal-overlay";
const UPPER_CONTENT = "upper overlay content";

const UPPER_OVERLAYS = [
  {
    name: "Menu",
    node: (
      <Menu defaultOpened>
        <Menu.Target>
          <Button>menu target</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item>{UPPER_CONTENT}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    ),
  },
  {
    name: "Popover",
    node: (
      <Popover defaultOpened>
        <Popover.Target>
          <Button>popover target</Button>
        </Popover.Target>
        <Popover.Dropdown>{UPPER_CONTENT}</Popover.Dropdown>
      </Popover>
    ),
  },
];

const setup = (children?: ReactNode) => {
  const onClose = jest.fn();

  render(
    <Modal.Root opened onClose={onClose}>
      <Modal.Overlay data-testid={OVERLAY_TESTID} />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Parent modal</Modal.Title>
        </Modal.Header>
        <Modal.Body>{children}</Modal.Body>
      </Modal.Content>
    </Modal.Root>,
  );

  return { onClose };
};

describe("Modal with an overlay above it", () => {
  it.each(UPPER_OVERLAYS)(
    "stays open when a $name above it is dismissed by clicking the backdrop",
    async ({ node }) => {
      const { onClose } = setup(node);
      expect(await screen.findByText(UPPER_CONTENT)).toBeInTheDocument();

      await userEvent.click(screen.getByTestId(OVERLAY_TESTID));

      await waitFor(() => {
        expect(screen.queryByText(UPPER_CONTENT)).not.toBeInTheDocument();
      });
      expect(onClose).not.toHaveBeenCalled();
    },
  );
});

describe("Modal with no overlay above it", () => {
  it("closes when clicking the backdrop", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByTestId(OVERLAY_TESTID));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on escape", async () => {
    const { onClose } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});

describe("Modal stacked under another modal", () => {
  it("escape closes only the topmost modal", async () => {
    const onCloseBase = jest.fn();
    const onCloseTop = jest.fn();

    render(
      <>
        <Modal.Root opened onClose={onCloseBase}>
          <Modal.Overlay />
          <Modal.Content>
            <Modal.Title>Base modal</Modal.Title>
          </Modal.Content>
        </Modal.Root>
        <Modal.Root opened onClose={onCloseTop}>
          <Modal.Overlay />
          <Modal.Content>
            <Modal.Title>Top modal</Modal.Title>
          </Modal.Content>
        </Modal.Root>
      </>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onCloseTop).toHaveBeenCalled();
    expect(onCloseBase).not.toHaveBeenCalled();
  });
});

describe("Modal with a closed dropdown input inside it", () => {
  const CLOSED_DROPDOWN_INPUTS = [
    {
      name: "Autocomplete",
      // the modal's focus trap lands on the input; keep its dropdown closed so it is the modal that escape reaches
      node: (
        <Autocomplete
          data={["alpha"]}
          placeholder="autocomplete"
          openOnFocus={false}
        />
      ),
    },
    { name: "Select", node: <Select data={["alpha"]} placeholder="select" /> },
  ];

  it.each(CLOSED_DROPDOWN_INPUTS)(
    "closes on escape and on the backdrop with a closed $name inside",
    async ({ node }) => {
      const { onClose } = setup(node);

      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByTestId(OVERLAY_TESTID));
      expect(onClose).toHaveBeenCalledTimes(2);
    },
  );
});
