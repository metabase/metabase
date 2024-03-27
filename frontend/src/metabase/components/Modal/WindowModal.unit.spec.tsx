import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen } from "__support__/ui";
import { WindowModal } from "metabase/components/Modal/WindowModal";

const WINDOW_MODAL_CONTENT = "Close modal";

const TestWindowModalComponent = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button data-testid="modal-toggle" onClick={() => setIsOpen(!isOpen)}>
        Toggle modal
      </button>
      <WindowModal isOpen={isOpen}>
        <button data-testid="modal-button" onClick={() => setIsOpen(!isOpen)}>
          {WINDOW_MODAL_CONTENT}
        </button>
      </WindowModal>
    </div>
  );
};

const setup = () => {
  render(<TestWindowModalComponent />);
};

describe("WindowModal", () => {
  it("should render modal content when the modal is opened", async () => {
    setup();
    await userEvent.click(screen.getByTestId("modal-toggle"));
    expect(screen.getByText(WINDOW_MODAL_CONTENT)).toBeInTheDocument();
  });

  it("should not render modal content if the modal has been closed", async () => {
    setup();
    await userEvent.click(screen.getByTestId("modal-toggle"));
    expect(screen.getByText(WINDOW_MODAL_CONTENT)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("modal-toggle"));

    await waitFor(() =>
      expect(screen.queryByText(WINDOW_MODAL_CONTENT)).not.toBeInTheDocument(),
    );
  });

  it("should only allow keyboard navigation on elements inside the modal", async () => {
    setup();
    await userEvent.click(screen.getByTestId("modal-toggle"));
    await screen.findByText(WINDOW_MODAL_CONTENT);

    // first tab to establish that the focus is on the modal button
    await userEvent.tab();
    expect(screen.getByTestId("modal-button")).toHaveFocus();

    // second tab to make sure that focus doesn't leave the modal or the button.
    await userEvent.tab();
    expect(screen.getByTestId("modal-button")).toHaveFocus();
  });
});
