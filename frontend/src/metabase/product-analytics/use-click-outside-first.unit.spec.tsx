import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createPortal } from "react-dom";

import { render, screen } from "__support__/ui";

import { useClickOutsideFirst } from "./use-click-outside-first";

type HarnessProps = {
  onClickOutside: () => void;
  onOutsideButtonClick?: (commitCount: number) => void;
};

/**
 * An element with a button inside it and one in a portal, next to an outside
 * button whose click reports how many clicks outside it has seen rendered.
 */
const Harness = ({
  onClickOutside,
  onOutsideButtonClick = () => undefined,
}: HarnessProps) => {
  const [commitCount, setCommitCount] = useState(0);
  const handlePointerDownInside = useClickOutsideFirst(() => {
    setCommitCount((count) => count + 1);
    onClickOutside();
  });

  return (
    <>
      <div onPointerDownCapture={handlePointerDownInside}>
        <button>Inside</button>
        {createPortal(<button>In a portal</button>, document.body)}
      </div>
      <button onClick={() => onOutsideButtonClick(commitCount)}>Outside</button>
    </>
  );
};

type SetupOpts = {
  onOutsideButtonClick?: (commitCount: number) => void;
};

const setup = ({ onOutsideButtonClick }: SetupOpts = {}) => {
  const onClickOutside = jest.fn<void, []>();
  const { unmount } = render(
    <Harness
      onClickOutside={onClickOutside}
      onOutsideButtonClick={onOutsideButtonClick}
    />,
  );
  return { onClickOutside, unmount };
};

describe("useClickOutsideFirst", () => {
  it("is called for a click outside", async () => {
    const { onClickOutside } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  it("isn't called for a click inside or in a portal", async () => {
    const { onClickOutside } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Inside" }));
    await userEvent.click(screen.getByRole("button", { name: "In a portal" }));

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it("waits for the click rather than the press", async () => {
    const { onClickOutside } = setup();
    const outside = screen.getByRole("button", { name: "Outside" });
    // One instance, so the release pairs with the press.
    const user = userEvent.setup();

    await user.pointer({ keys: "[MouseLeft>]", target: outside });
    expect(onClickOutside).not.toHaveBeenCalled();

    await user.pointer({ keys: "[/MouseLeft]", target: outside });
    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  it("isn't called for a press inside released outside", async () => {
    const { onClickOutside } = setup();

    await userEvent.pointer([
      {
        keys: "[MouseLeft>]",
        target: screen.getByRole("button", { name: "Inside" }),
      },
      { target: document.body },
      { keys: "[/MouseLeft]" },
    ]);

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it("isn't called for a click from the keyboard", async () => {
    const { onClickOutside } = setup();

    screen.getByRole("button", { name: "Outside" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it("renders its updates before the click's own handler runs", async () => {
    const onOutsideButtonClick = jest.fn<void, [number]>();
    setup({ onOutsideButtonClick });

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    expect(onOutsideButtonClick).toHaveBeenCalledTimes(1);
    expect(onOutsideButtonClick).toHaveBeenCalledWith(1);
  });

  it("stops listening once unmounted", async () => {
    const { onClickOutside, unmount } = setup();

    unmount();
    await userEvent.click(document.body);

    expect(onClickOutside).not.toHaveBeenCalled();
  });
});
