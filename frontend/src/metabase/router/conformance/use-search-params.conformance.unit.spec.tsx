import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import type { RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

function SearchParamsProbe({ api }: { api: RouterApi }) {
  const [searchParams, setSearchParams] = api.useSearchParams();
  const location = api.useLocation();
  return (
    <div>
      <span data-testid="rr-x">{searchParams.get("x")}</span>
      <span data-testid="rr-y">{searchParams.get("y")}</span>
      <span data-testid="rr-brand">
        {searchParams.getAll("brand").join(",")}
      </span>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-search">{location.search}</span>
      <span data-testid="rr-hash">{location.hash}</span>
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

function DefaultInitProbe({ api }: { api: RouterApi }) {
  const [searchParams, setSearchParams] = api.useSearchParams({ page: "1" });
  return (
    <div>
      <span data-testid="rr-page">{searchParams.get("page")}</span>
      <span data-testid="rr-q">{searchParams.get("q")}</span>
      <button onClick={() => setSearchParams({ q: "x" })}>set-other</button>
    </div>
  );
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

const AT_FOO = { facadePath: "foo", v7Path: "foo" };

describe("router/useSearchParams conformance", () => {
  it("matches v7 when reading the current query string", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo?x=1",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-x"]).toBe("1");
  });

  it("matches v7 when setting new params", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo?x=1",
      interact: () => click("set"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-search"]).toBe("?x=2&y=9");
  });

  it("matches v7 when expanding array values into repeated params", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo",
      interact: () => click("set-array"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-brand"]).toBe("nike,reebok");
  });

  it("matches v7 for a functional updater over the previous params", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo?x=1",
      interact: () => click("update"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-x"]).toBe("3");
  });

  it("matches v7 when clearing the query", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo?x=1",
      interact: () => click("clear"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-search"]).toBe("");
  });

  it("matches v7's handling of the existing hash when setting params", async () => {
    const { facade, v7 } = await runBoth(SearchParamsProbe, {
      ...AT_FOO,
      initialRoute: "/foo?x=1#section",
      interact: () => click("set"),
    });
    expect(facade).toEqual(v7);
  });

  it("matches v7 when filling in a default the URL is missing", async () => {
    const { facade, v7 } = await runBoth(DefaultInitProbe, {
      ...AT_FOO,
      initialRoute: "/foo",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("1");
  });

  it("matches v7 when the URL value wins over the default", async () => {
    const { facade, v7 } = await runBoth(DefaultInitProbe, {
      ...AT_FOO,
      initialRoute: "/foo?page=5",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("5");
  });

  it("matches v7 when a default stops being merged after a set", async () => {
    const { facade, v7 } = await runBoth(DefaultInitProbe, {
      ...AT_FOO,
      initialRoute: "/foo",
      interact: () => click("set-other"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-page"]).toBe("");
    expect(facade["rr-q"]).toBe("x");
  });
});
