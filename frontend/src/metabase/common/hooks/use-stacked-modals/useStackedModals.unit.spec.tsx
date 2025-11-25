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

  return (
    <div>
      <button onClick={() => open("second")}>Open second</button>
      <Modal {...getModalProps("first")}>First</Modal>
      <Modal {...getModalProps("second")}>Second</Modal>
    </div>
  );
};

describe("useStackedModals", () => {
  it("closes only the last opened sidesheet on Escape", async () => {
    render(<TestComponent />);

    // First should open by default (after mount)
    await screen.findByText("First");
    expect(screen.queryByText("Second")).not.toBeInTheDocument();

    // Open the second modal
    await userEvent.click(screen.getByText("Open second"));
    await screen.findByText("Second");

    // Press Escape – only the top (second) should close
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });
});
