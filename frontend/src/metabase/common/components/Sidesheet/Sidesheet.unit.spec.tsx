import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, render, screen, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";

import { Sidesheet, useSidesheetClose } from "./Sidesheet";

const CloseFromInside = () => {
  const close = useSidesheetClose();
  return <button onClick={close}>close from inside</button>;
};

const Draft = () => {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label="draft"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
};

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

  it("should render header actions and a footer", () => {
    render(
      <Sidesheet
        title="My Title"
        isOpen
        onClose={jest.fn()}
        actions={<button>an action</button>}
        footer={<div>a footer</div>}
      >
        hello world
      </Sidesheet>,
    );

    expect(screen.getByRole("button", { name: "an action" })).toBeVisible();
    expect(screen.getByText("a footer")).toBeVisible();
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
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("should fire onClose when Escape is pressed", async () => {
    const closeSpy = jest.fn();
    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("should fire onClose only after the exit transition when closed from inside", async () => {
    const closeSpy = jest.fn();
    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        <CloseFromInside />
      </Sidesheet>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "close from inside" }),
    );

    expect(closeSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("should fire onClose only after the exit transition when the close hotkey is pressed", async () => {
    const closeSpy = jest.fn();
    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy} closeHotkey="]">
        hello world
      </Sidesheet>,
    );

    await userEvent.keyboard("]");

    expect(closeSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("should not fire onClose when the consumer closes it with isOpen", async () => {
    const closeSpy = jest.fn();
    const { rerender } = render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    rerender(
      <Sidesheet title="My Title" isOpen={false} onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    await waitFor(() =>
      expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument(),
    );
    expect(closeSpy).not.toHaveBeenCalled();
  });

  describe("confirmClose", () => {
    it.each([
      ["Escape", () => userEvent.keyboard("{Escape}")],
      [
        "the close button",
        () => userEvent.click(screen.getByLabelText("Close")),
      ],
      [
        "the overlay",
        () => userEvent.click(screen.getByTestId("modal-overlay")),
      ],
      ["the close hotkey", () => userEvent.keyboard("]")],
      [
        "useSidesheetClose",
        () =>
          userEvent.click(
            screen.getByRole("button", { name: "close from inside" }),
          ),
      ],
    ])(
      "should keep the sheet and its state until confirmClose answers, then close only on true (%s)",
      async (_trigger, attemptClose) => {
        const closeSpy = jest.fn();
        const answer = defer<boolean>();
        const confirmClose = jest.fn(() => answer.promise);
        render(
          <Sidesheet
            title="My Title"
            isOpen
            onClose={closeSpy}
            confirmClose={confirmClose}
            closeHotkey="]"
          >
            <Draft />
            <CloseFromInside />
          </Sidesheet>,
        );
        await userEvent.type(screen.getByLabelText("draft"), "unsaved");
        await userEvent.tab();

        await attemptClose();

        expect(confirmClose).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText("draft")).toHaveValue("unsaved");
        expect(closeSpy).not.toHaveBeenCalled();

        await act(async () => {
          answer.resolve(false);
          await answer.promise;
        });

        expect(screen.getByLabelText("draft")).toHaveValue("unsaved");
        expect(closeSpy).not.toHaveBeenCalled();

        confirmClose.mockReturnValue(Promise.resolve(true));
        await attemptClose();

        await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
      },
    );
  });

  it("useSidesheetClose should throw outside a Sidesheet", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => render(<CloseFromInside />)).toThrow(
      "useSidesheetClose must be used inside a Sidesheet",
    );

    consoleError.mockRestore();
  });
});
