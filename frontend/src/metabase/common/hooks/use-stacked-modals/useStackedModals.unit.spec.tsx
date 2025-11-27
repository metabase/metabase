import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Modal } from "metabase/ui";

import { useStackedModals } from "./useStackedModals";

const TestComponent = () => {
  const { getModalProps, open } = useStackedModals({
    modals: ["first", "second"],
    defaultOpened: "first",
    withOverlay: true,
  });

  const firstModalProps = getModalProps("first");
  const secondModalProps = getModalProps("second");

  return (
    <div>
      <button onClick={() => open("second")}>Open second</button>
      <Modal
        opened={firstModalProps.isOpen}
        onClose={firstModalProps.onClose}
        closeOnEscape={firstModalProps.closeOnEscape}
        withOverlay={firstModalProps.withOverlay}
      >
        First
      </Modal>
      <Modal
        opened={secondModalProps.isOpen}
        onClose={secondModalProps.onClose}
        closeOnEscape={secondModalProps.closeOnEscape}
        withOverlay={secondModalProps.withOverlay}
      >
        Second
      </Modal>
    </div>
  );
};

describe("useStackedModals", () => {
  it("closes only the last opened sidesheet on Escape", async () => {
    render(<TestComponent />);

    // First should open by default (after mount)
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();

    // Open the second modal
    await userEvent.click(screen.getByText("Open second"));
    expect(screen.getByText("Second")).toBeInTheDocument();

    // Press Escape – only the top (second) should close
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });
});
