import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "__support__/ui";
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
    const timeout = 50;
    setup({ timeout });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("delay: true");

    userEvent.hover(button);
    expect(button).toHaveTextContent("delay: false");

    userEvent.unhover(button);
    expect(button).toHaveTextContent("delay: false");
    const start = Date.now();

    await waitFor(function () {
      expect(button).toHaveTextContent("delay: true");
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeCloseTo(timeout, -1);
  });
});
