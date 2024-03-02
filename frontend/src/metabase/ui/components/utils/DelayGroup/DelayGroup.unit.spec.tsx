import userEvent from "@testing-library/user-event";

import { render, screen, act } from "__support__/ui";

import { DelayGroup, useDelayGroup } from "./DelayGroup";

interface SetupOpts {
  timeout: number;
}

function setup(opts: SetupOpts) {
  render(
    <DelayGroup timeout={opts.timeout}>
      <Child />
    </DelayGroup>,
  );
}

function Child() {
  const { shouldDelay, onOpen, onClose } = useDelayGroup();
  return (
    <button onMouseEnter={onOpen} onMouseLeave={onClose}>
      delay: {JSON.stringify(shouldDelay)}
    </button>
  );
}

describe("DelayGroup", () => {
  it("should be delayed by default and only remove delay after a timeout", async () => {
    jest.useFakeTimers();

    const timeout = 500;
    setup({ timeout });

    const button = screen.getByRole("button");

    expect(button).toHaveTextContent("delay: true");

    userEvent.hover(button);
    expect(button).toHaveTextContent("delay: false");

    userEvent.unhover(button);
    expect(button).toHaveTextContent("delay: false");

    act(function () {
      jest.advanceTimersByTime(timeout / 2);
      expect(button).toHaveTextContent("delay: false");

      jest.advanceTimersByTime(timeout / 2 + 1);
      expect(button).toHaveTextContent("delay: true");
    });
  });
});
