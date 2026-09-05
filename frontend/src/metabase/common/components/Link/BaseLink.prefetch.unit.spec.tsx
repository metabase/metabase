import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Route, registerPagePrefetch } from "metabase/router";

import { Link } from "./Link";

let nextId = 0;
const uniquePath = () => `/prefetch-link-spec-${nextId++}`;

function setup(path: string, onMouseEnter?: () => void) {
  const load = jest.fn().mockResolvedValue(undefined);
  registerPagePrefetch(path, load);

  renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <Link to={path} onMouseEnter={onMouseEnter}>
            split page
          </Link>
          <Link to={uniquePath()}>ordinary page</Link>
        </>
      }
    />,
    { withRouter: true, initialRoute: "/" },
  );

  return { load };
}

describe("BaseLink prefetching", () => {
  it("loads the target's chunk when the link is hovered", async () => {
    const { load } = setup(uniquePath());

    await userEvent.hover(screen.getByText("split page"));

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads it on keyboard focus too", () => {
    const { load } = setup(uniquePath());

    screen.getByText("split page").focus();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("leaves a link with nothing to prefetch alone", async () => {
    const { load } = setup(uniquePath());

    await userEvent.hover(screen.getByText("ordinary page"));

    expect(load).not.toHaveBeenCalled();
  });

  it("still calls the call site's own hover handler", async () => {
    const onMouseEnter = jest.fn();
    const { load } = setup(uniquePath(), onMouseEnter);

    await userEvent.hover(screen.getByText("split page"));

    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
