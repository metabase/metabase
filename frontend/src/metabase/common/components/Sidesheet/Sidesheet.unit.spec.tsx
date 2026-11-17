import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen } from "__support__/ui";

import { Sidesheet } from "./Sidesheet";

describe("Sidesheet", () => {
  it("should render when open", () => {
    render(
      <Sidesheet isOpen onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should not render when not open", () => {
    render(
      <Sidesheet isOpen={false} onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument();
  });

  it("should render with title", () => {
    render(
      <Sidesheet title="My Title" isOpen onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("should render with children", () => {
    render(
      <Sidesheet title="My Title" isOpen onClose={jest.fn()}>
        <div>some content</div>
        <div>more content</div>
      </Sidesheet>,
    );

    expect(screen.getByText("some content")).toBeInTheDocument();
    expect(screen.getByText("more content")).toBeInTheDocument();
  });

  it("should fire onClose when close button is clicked", async () => {
    const closeSpy = jest.fn();
    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    const closeButton = screen.getByLabelText("Close");
    await userEvent.click(closeButton);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("should fire onClose when modal backdrop is clicked", async () => {
    const closeSpy = jest.fn();

    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    const backdrop = screen.getByTestId("modal-overlay");
    await userEvent.click(backdrop);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("moves focus to a non-modal sheet's title and back to its opener on close", async () => {
    render(<NonModalSheetWithOpener />);

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("My Title")).toHaveFocus();

    await userEvent.click(screen.getByLabelText("Close"));
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("returns focus to a non-modal sheet's opener when Escape closes it", async () => {
    render(<NonModalSheetWithOpener />);

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });
});

function NonModalSheetWithOpener() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      <Sidesheet
        title="My Title"
        isOpen={isOpen}
        isModal={false}
        onClose={() => setIsOpen(false)}
      >
        hello world
      </Sidesheet>
    </>
  );
}
