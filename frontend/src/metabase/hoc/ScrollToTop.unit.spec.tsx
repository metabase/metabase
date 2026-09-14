import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Route, useNavigate } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

import ScrollToTop from "./ScrollToTop";

function Navigator() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/second")}>to-second</button>
      <button onClick={() => navigate("/first?q=1")}>same-path-query</button>
    </div>
  );
}

function RouteContent() {
  return (
    <ScrollToTop>
      <Navigator />
    </ScrollToTop>
  );
}

function setup(initialRoute = "/first") {
  const { history, ...rest } = renderWithProviders(
    <Route path="*" element={<RouteContent />} />,
    { withRouter: true, initialRoute },
  );
  return { ...rest, history: checkNotNull(history) };
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("ScrollToTop", () => {
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    scrollTo.mockRestore();
  });

  it("does not scroll on the initial render", () => {
    setup();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls to the top when the pathname changes", async () => {
    setup();
    await click("to-second");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not scroll when only the query string changes", async () => {
    setup();
    await click("same-path-query");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll when navigating back through browser history", async () => {
    const { history } = setup();

    await click("to-second");
    scrollTo.mockClear();

    act(() => {
      history.goBack();
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
