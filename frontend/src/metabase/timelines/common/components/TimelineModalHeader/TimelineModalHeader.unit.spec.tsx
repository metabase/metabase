import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Modal } from "metabase/ui";

import {
  TimelineModalHeader,
  type TimelineModalHeaderProps,
} from "./TimelineModalHeader";

interface SetupOpts extends Partial<TimelineModalHeaderProps> {
  onClose?: () => void;
}

const setup = ({ onClose = jest.fn(), ...props }: SetupOpts = {}) => {
  renderWithProviders(
    <Modal.Root opened onClose={onClose}>
      <Modal.Content>
        <TimelineModalHeader title="Events" {...props} />
      </Modal.Content>
    </Modal.Root>,
  );

  return { onClose };
};

describe("TimelineModalHeader", () => {
  it("should render the title as the modal heading", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Events" })).toBeInTheDocument();
    expect(screen.queryByText(/^in/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("should render the collection path and the menu's links", async () => {
    setup({
      collectionName: "Foo",
      menu: {
        label: "Timeline menu",
        items: [{ label: "New timeline", to: "/collection/1/timelines/new" }],
      },
    });

    expect(screen.getByText(/^in.*Foo$/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Timeline menu" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "New timeline" }),
    ).toHaveAttribute("href", "/collection/1/timelines/new");
  });

  it("should leave out a menu with no items", () => {
    setup({ menu: { label: "Timeline menu", items: [] } });

    expect(
      screen.queryByRole("button", { name: "Timeline menu" }),
    ).not.toBeInTheDocument();
  });

  it("should go back", async () => {
    const onGoBack = jest.fn();
    setup({ onGoBack });

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onGoBack).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("heading", { name: "Events" }));
    expect(onGoBack).toHaveBeenCalledTimes(2);
  });

  it("should close the modal", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
