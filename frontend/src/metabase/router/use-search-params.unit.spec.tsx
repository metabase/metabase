import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";

import { Route } from "./route";
import { useSearchParams } from "./use-search-params";

function SearchParamsProbe() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <div>
      <span data-testid="x">{searchParams.get("x")}</span>
      <span data-testid="y">{searchParams.get("y")}</span>
      <span data-testid="brand">{searchParams.getAll("brand").join(",")}</span>
      <span data-testid="is-url-search-params">
        {String(searchParams instanceof URLSearchParams)}
      </span>
      <button onClick={() => setSearchParams({ x: "2", y: "9" })}>set</button>
      <button onClick={() => setSearchParams({ brand: ["nike", "reebok"] })}>
        set-array
      </button>
      <button onClick={() => setSearchParams()}>clear</button>
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
    <Route path="foo" element={<SearchParamsProbe />} />,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("router/useSearchParams", () => {
  it("reads the current query string as a URLSearchParams", () => {
    setup("/foo?x=1");

    expect(screen.getByTestId("x")).toHaveTextContent("1");
    expect(screen.getByTestId("is-url-search-params")).toHaveTextContent(
      "true",
    );
  });

  it("navigates to the new query string when set", async () => {
    const { history } = setup("/foo?x=1");

    await click("set");

    expect(screen.getByTestId("x")).toHaveTextContent("2");
    expect(screen.getByTestId("y")).toHaveTextContent("9");
    expect(history?.getCurrentLocation().pathname).toBe("/foo");
    expect(history?.getCurrentLocation().search).toBe("?x=2&y=9");
  });

  it("pushes by default so the previous query stays in history", async () => {
    const { history } = setup("/foo?x=1");

    await click("set");
    expect(screen.getByTestId("x")).toHaveTextContent("2");

    act(() => history?.goBack());
    expect(screen.getByTestId("x")).toHaveTextContent("1");
  });

  it("expands array values into repeated params", async () => {
    setup("/foo");

    await click("set-array");

    expect(screen.getByTestId("brand")).toHaveTextContent("nike,reebok");
  });

  it("supports a functional updater over the previous params", async () => {
    setup("/foo?x=1");

    await click("update");

    expect(screen.getByTestId("x")).toHaveTextContent("3");
  });

  it("clears the query when called without an argument", async () => {
    const { history } = setup("/foo?x=1");

    await click("clear");

    expect(screen.getByTestId("x")).toBeEmptyDOMElement();
    expect(history?.getCurrentLocation().search).toBe("");
  });

  it("gives the functional updater a clone, not the held instance", async () => {
    let held: URLSearchParams | undefined;
    const MutatingProbe = () => {
      const [searchParams, setSearchParams] = useSearchParams();
      held = searchParams;
      return (
        <button
          onClick={() =>
            setSearchParams((prev) => {
              prev.set("x", "mutated");
              return prev;
            })
          }
        >
          mutate
        </button>
      );
    };
    renderWithProviders(<Route path="foo" element={<MutatingProbe />} />, {
      withRouter: true,
      initialRoute: "/foo?x=1",
    });

    const before = held;
    await userEvent.click(screen.getByRole("button", { name: "mutate" }));

    // The instance the component held is untouched: the updater mutated a clone.
    expect(before?.get("x")).toBe("1");
  });
});

function DefaultProbe() {
  const [searchParams, setSearchParams] = useSearchParams({ page: "1" });
  return (
    <div>
      <span data-testid="page">{searchParams.get("page")}</span>
      <span data-testid="q">{searchParams.get("q")}</span>
      <button onClick={() => setSearchParams({ q: "x" })}>set-other</button>
    </div>
  );
}

function setupDefault(initialRoute: string) {
  return renderWithProviders(<Route path="foo" element={<DefaultProbe />} />, {
    withRouter: true,
    initialRoute,
  });
}

describe("router/useSearchParams defaultInit", () => {
  it("fills in a default the URL is missing", () => {
    setupDefault("/foo");
    expect(screen.getByTestId("page")).toHaveTextContent("1");
  });

  it("lets the URL value win over the default", () => {
    setupDefault("/foo?page=5");
    expect(screen.getByTestId("page")).toHaveTextContent("5");
  });

  it("stops merging the default once params have been set", async () => {
    setupDefault("/foo");
    expect(screen.getByTestId("page")).toHaveTextContent("1");

    await userEvent.click(screen.getByRole("button", { name: "set-other" }));

    // Once set, the default no longer reappears, so it does not stick forever.
    expect(screen.getByTestId("q")).toHaveTextContent("x");
    expect(screen.getByTestId("page")).toBeEmptyDOMElement();
  });
});
