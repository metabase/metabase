import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

import { useRouteLeaveBlocker } from "./use-route-leave-blocker";

const shouldBlock = jest.fn();

/**
 * Renders the blocker's state, and buttons for the two ways out of it, so a spec
 * can assert on a parked navigation and then resume or drop it.
 */
function Guard() {
  const blocker = useRouteLeaveBlocker(shouldBlock);

  return (
    <div>
      <span data-testid="blocker-state">{blocker.state}</span>
      <span data-testid="blocked-pathname">
        {blocker.location?.pathname ?? ""}
      </span>
      <button onClick={() => blocker.proceed?.()}>proceed</button>
      <button onClick={() => blocker.reset?.()}>reset</button>
    </div>
  );
}

const setup = (initialRoute = "/a") => {
  const { history } = renderWithProviders(
    <Route path="/">
      <Route path="a" element={<Guard />} />
      <Route path="b" element={<span>page b</span>} />
    </Route>,
    { withRouter: true, initialRoute },
  );

  return { history: checkNotNull(history) };
};

describe("useRouteLeaveBlocker", () => {
  beforeEach(() => {
    shouldBlock.mockReturnValue(false);
  });

  it("parks a push while it blocks", () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setup();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("blocked");
  });

  it("lets a push through when it does not block", () => {
    const { history } = setup();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  it("parks a replace while it blocks", () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setup();

    act(() => history.replace("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/a");
  });

  it("hands the attempted destination and the navigation type to the caller", () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setup();

    act(() => history.push("/b?x=1"));

    expect(shouldBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextLocation: expect.objectContaining({
          pathname: "/b",
          search: "?x=1",
        }),
        historyAction: "PUSH",
      }),
    );
    expect(screen.getByTestId("blocked-pathname")).toHaveTextContent("/b");
  });

  it("resumes the parked navigation on proceed", async () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setup();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "proceed" }));

    expect(history.getCurrentLocation().pathname).toBe("/b");
    expect(screen.getByText("page b")).toBeInTheDocument();
  });

  it("drops the parked navigation on reset", async () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setup();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "reset" }));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("unblocked");
  });

  it("cancels the browser back button while it blocks", () => {
    const { history } = setup();
    act(() => history.push("/b"));
    act(() => history.push("/a"));
    shouldBlock.mockReturnValue(true);

    act(() => history.goBack());

    expect(history.getCurrentLocation().pathname).toBe("/a");
  });

  it("lets the browser back button through when it does not block", () => {
    const { history } = setup();
    act(() => history.push("/b"));
    act(() => history.push("/a"));

    act(() => history.goBack());

    expect(history.getCurrentLocation().pathname).toBe("/b");
  });
});

const outerShouldBlock = jest.fn();

function OuterGuard({ children }: PropsWithChildren) {
  const blocker = useRouteLeaveBlocker(outerShouldBlock);

  return (
    <div>
      <span data-testid="outer-state">{blocker.state}</span>
      <button onClick={() => blocker.proceed?.()}>proceed outer</button>
      {children}
    </div>
  );
}

const setupNestedGuards = () => {
  const { history } = renderWithProviders(
    <Route path="/">
      <Route
        path="a"
        element={
          <OuterGuard>
            <Guard />
          </OuterGuard>
        }
      />
      <Route path="b" element={<span>page b</span>} />
    </Route>,
    { withRouter: true, initialRoute: "/a" },
  );

  return { history: checkNotNull(history) };
};

// react-router holds one blocker per router. The app fans that one out, so a
// guard is not silently dropped when another is mounted on the same page: the
// caching sidebar mounts one inside the dashboard and the query builder, which
// carry their own.
describe("useRouteLeaveBlocker with several guards mounted", () => {
  beforeEach(() => {
    outerShouldBlock.mockReturnValue(false);
    shouldBlock.mockReturnValue(false);
  });

  it("blocks when only the inner guard says so", () => {
    shouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("blocked");
    expect(screen.getByTestId("outer-state")).toHaveTextContent("unblocked");
  });

  it("blocks when only the outer guard says so", () => {
    outerShouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("outer-state")).toHaveTextContent("blocked");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("unblocked");
  });

  it("gives the prompt to the inner guard when both say so", () => {
    outerShouldBlock.mockReturnValue(true);
    shouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("blocked");
    expect(screen.getByTestId("outer-state")).toHaveTextContent("unblocked");
  });

  it("asks the outer guard once the inner one is let through", async () => {
    outerShouldBlock.mockReturnValue(true);
    shouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "proceed" }));

    // Letting the inner guard through hands the prompt to the outer one rather
    // than releasing the navigation, so a second dirty form still gets a say.
    expect(screen.getByTestId("outer-state")).toHaveTextContent("blocked");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("unblocked");
    expect(history.getCurrentLocation().pathname).toBe("/a");
  });

  it("resumes the navigation once every guard has been asked", async () => {
    outerShouldBlock.mockReturnValue(true);
    shouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "proceed" }));
    await userEvent.click(
      screen.getByRole("button", { name: "proceed outer" }),
    );

    expect(await screen.findByText("page b")).toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  it("drops the navigation when any guard in the chain resets", async () => {
    outerShouldBlock.mockReturnValue(true);
    shouldBlock.mockReturnValue(true);
    const { history } = setupNestedGuards();
    act(() => history.push("/b"));

    await userEvent.click(screen.getByRole("button", { name: "reset" }));

    expect(history.getCurrentLocation().pathname).toBe("/a");
    expect(screen.getByTestId("blocker-state")).toHaveTextContent("unblocked");
    expect(screen.getByTestId("outer-state")).toHaveTextContent("unblocked");
  });

  it("lets a navigation through when neither says so", () => {
    const { history } = setupNestedGuards();

    act(() => history.push("/b"));

    expect(history.getCurrentLocation().pathname).toBe("/b");
  });
});

// A guard registers with the provider above it, which only a mounted router
// supplies. Without one it registers nowhere, so it cannot hold a navigation it
// has no way to release.
describe("useRouteLeaveBlocker outside a router", () => {
  it("is inert rather than an error", () => {
    shouldBlock.mockReturnValue(true);
    shouldBlock.mockClear();

    renderWithProviders(<Guard />, { withRouter: false });

    expect(screen.getByTestId("blocker-state")).toHaveTextContent("unblocked");
    expect(shouldBlock).not.toHaveBeenCalled();
  });
});
