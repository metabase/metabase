import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { Sidesheet } from "./Sidesheet";
import { useStackedSidesheets } from "./useStackedSidesheets";

const TestComponent = () => {
  const sidesheets = ["first", "second"] as const;
  type Key = (typeof sidesheets)[number];

  const { getModalProps, openSidesheet } = useStackedSidesheets<Key>({
    sidesheets: sidesheets as unknown as Key[],
    defaultOpened: "first",
    withOverlay: true,
  });

  return (
    <div>
      <button onClick={() => openSidesheet("second")}>Open second</button>
      <Sidesheet title="First" {...getModalProps("first")}>
        first-content
      </Sidesheet>
      <Sidesheet title="Second" {...getModalProps("second")}>
        second-content
      </Sidesheet>
    </div>
  );
};

describe("useStackedSidesheets", () => {
  it("closes only the last opened sidesheet on Escape", async () => {
    render(<TestComponent />);

    // First should open by default (after mount)
    await screen.findByText("First");
    expect(screen.queryByText("Second")).not.toBeInTheDocument();

    // Open the second sidesheet
    await userEvent.click(screen.getByText("Open second"));
    await screen.findByText("Second");

    // Press Escape – only the top (second) should close
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });
});
