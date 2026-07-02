import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { useSearchParams } from "./use-search-params";

function SearchParamsProbe() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <div>
      <span data-testid="x">{searchParams.get("x")}</span>
      <span data-testid="y">{searchParams.get("y")}</span>
      <button onClick={() => setSearchParams({ x: "2", y: "9" })}>set</button>
      <button
        onClick={() =>
          setSearchParams((prev) => {
            prev.set("x", "3");
            return prev;
          })
        }
      >
        update
      </button>
    </div>
  );
}

function setup(initialRoute: string) {
  return renderWithProviders(
    <Route path="foo" component={SearchParamsProbe} />,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

describe("useSearchParams", () => {
  it("reads the current query string as URLSearchParams", () => {
    setup("/foo?x=1");
    expect(screen.getByTestId("x")).toHaveTextContent("1");
  });

  it("navigates to the new query string when set", async () => {
    const { history } = setup("/foo?x=1");

    await userEvent.click(screen.getByRole("button", { name: "set" }));

    expect(screen.getByTestId("x")).toHaveTextContent("2");
    expect(screen.getByTestId("y")).toHaveTextContent("9");
    expect(history?.getCurrentLocation().pathname).toBe("/foo");
    expect(history?.getCurrentLocation().search).toBe("?x=2&y=9");
  });

  it("supports a functional updater over the previous params", async () => {
    setup("/foo?x=1");

    await userEvent.click(screen.getByRole("button", { name: "update" }));

    expect(screen.getByTestId("x")).toHaveTextContent("3");
  });
});
