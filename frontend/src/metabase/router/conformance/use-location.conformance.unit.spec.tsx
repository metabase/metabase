import type { RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

// v7's runtime `Location` carries an extra, undocumented `mask` field, so the
// differential compares the documented field values rather than the raw key set.
// The exact 5-field shape is locked down in use-location.unit.spec.tsx.
function LocationProbe({ api }: { api: RouterApi }) {
  const location = api.useLocation();
  return (
    <div>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-search">{location.search}</span>
      <span data-testid="rr-hash">{location.hash}</span>
      <span data-testid="rr-state">{JSON.stringify(location.state)}</span>
    </div>
  );
}

describe("router/useLocation conformance", () => {
  it("matches v7 for a url with search and hash", async () => {
    const { facade, v7 } = await runBoth(LocationProbe, {
      initialRoute: "/foo/bar?x=1&y=2#section",
      facadePath: "foo/bar",
      v7Path: "foo/bar",
    });
    expect(facade).toEqual(v7);
  });

  it("matches v7's Location field set and null state default", async () => {
    const { facade, v7 } = await runBoth(LocationProbe, {
      initialRoute: "/foo/bar",
      facadePath: "foo/bar",
      v7Path: "foo/bar",
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-state"]).toBe("null");
  });
});
