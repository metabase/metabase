import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Modal } from "metabase/ui";

import {
  TimelineModalHeader,
  type TimelineModalHeaderProps,
} from "./TimelineModalHeader";

interface SetupOpts extends Partial<TimelineModalHeaderProps> {
  onClose?: () => void;
}

const setup = ({ onClose = jest.fn(), ...props }: SetupOpts = {}) => {
  render(
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

  it("should render the collection path and actions", () => {
    setup({ collectionName: "Foo", actions: "Actions" });

    expect(screen.getByText(/^in.*Foo$/)).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("should go back", async () => {
    const onGoBack = jest.fn();
    setup({ onGoBack });

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("should close the modal", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
