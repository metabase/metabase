import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { Route } from "./react-router";
import { useNavigate } from "./use-navigate";

function NavigateProbe() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/foo")}>push</button>
      <button onClick={() => navigate("/bar", { state: { from: "here" } })}>
        push-state
      </button>
      <button onClick={() => navigate({ pathname: "/obj", search: "?x=1" })}>
        push-object
      </button>
      <button onClick={() => navigate("/bar?x=1", { state: { from: "here" } })}>
        push-string-query-state
      </button>
      <button onClick={() => navigate("/baz", { replace: true })}>
        replace
      </button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

function setup(initialRoute = "/") {
  return renderWithProviders(<Route path="*" component={NavigateProbe} />, {
    withRouter: true,
    initialRoute,
  });
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("router/useNavigate", () => {
  it("pushes a string destination", async () => {
    const { history } = setup();
    await click("push");
    expect(history?.getCurrentLocation().pathname).toBe("/foo");
  });

  it("attaches history state to the destination", async () => {
    const { history } = setup();
    await click("push-state");
    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe("/bar");
    expect(location?.state).toEqual({ from: "here" });
  });

  it("navigates to an object destination", async () => {
    const { history } = setup();
    await click("push-object");
    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe("/obj");
    expect(location?.search).toBe("?x=1");
  });

  it("splits a string destination carrying both a query and state", async () => {
    const { history } = setup();
    await click("push-string-query-state");
    const location = history?.getCurrentLocation();
    // The query must land in `search`, not be left glued onto `pathname`.
    expect(location?.pathname).toBe("/bar");
    expect(location?.search).toBe("?x=1");
    expect(location?.state).toEqual({ from: "here" });
  });

  it("replaces the current entry instead of pushing", async () => {
    const { history } = setup("/start");
    await click("push"); // /foo
    await click("replace"); // replaces /foo with /baz
    await click("back");
    expect(history?.getCurrentLocation().pathname).toBe("/start");
  });

  it("moves through the history stack with a numeric delta", async () => {
    const { history } = setup("/start");
    await click("push"); // /foo
    await click("back"); // navigate(-1)
    expect(history?.getCurrentLocation().pathname).toBe("/start");
  });
});
