import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";
import { type Location, Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

import { useConfirmRouteLeaveModal } from "./use-confirm-route-leave-modal";

interface GuardProps {
  isEnabled?: boolean;
  isLocationAllowed?: (location: Location | undefined) => boolean;
}

function Guard({ isEnabled = true, isLocationAllowed }: GuardProps) {
  const { opened, close, confirm, nextLocation } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
  });

  return (
    <div>
      <span data-testid="opened">{String(opened)}</span>
      <span data-testid="next-location">{nextLocation?.pathname ?? ""}</span>
      <button onClick={confirm}>confirm</button>
      <button onClick={close}>close</button>
    </div>
  );
}

const setup = (props: GuardProps = {}) => {
  const { history } = renderWithProviders(
    <Route path="/">
      <Route path="a" element={<Guard {...props} />} />
      <Route path="b" element={<span>page b</span>} />
    </Route>,
    { withRouter: true, initialRoute: "/a" },
  );

  return { history: checkNotNull(history) };
};

/**
 * Fires the event the browser sends on reload or tab close, and reports whether
 * a handler asked to interrupt it.
 */
const isUnloadGuarded = () => {
  const event = new Event("beforeunload", { cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
};

describe("useConfirmRouteLeaveModal", () => {
  it("opens on a navigation away, and reports where it was headed", () => {
    const { history } = setup();

    act(() => history.push("/b"));

    expect(screen.getByTestId("opened")).toHaveTextContent("true");
    expect(screen.getByTestId("next-location")).toHaveTextContent("/b");
    expect(history.getCurrentLocation().pathname).toBe("/a");
  });

  it("lets the navigation through on confirm", async () => {
    const { history } = setup();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "confirm" }));

    expect(await screen.findByText("page b")).toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  it("stays put on close", async () => {
    const { history } = setup();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByTestId("opened")).toHaveTextContent("false");
    expect(history.getCurrentLocation().pathname).toBe("/a");
  });

  it("does not open when it is disabled", () => {
    const { history } = setup({ isEnabled: false });

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  it("does not open for a destination the caller allows", () => {
    const { history } = setup({
      isLocationAllowed: (location) => location?.pathname === "/b",
    });

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  // `useBlocker` only sees in-app navigation, so reload and tab close stay with
  // the `beforeunload` guard.
  it("guards reload and tab close while it is enabled", () => {
    setup();

    expect(isUnloadGuarded()).toBe(true);
  });

  it("leaves reload and tab close alone when it is disabled", () => {
    setup({ isEnabled: false });

    expect(isUnloadGuarded()).toBe(false);
  });
});
