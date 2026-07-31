import { getRequestedDisplayAction } from "./getRequestedDisplayAction";

const base = {
  requestedDisplay: "bar",
  currentDisplay: "table",
  defaultDisplay: "table",
  queryKey: "query-1",
  settledQueryKey: null,
} as const;

describe("getRequestedDisplayAction (GHY-4157)", () => {
  it("applies the chart type the tool asked for once results have landed", () => {
    expect(getRequestedDisplayAction({ ...base })).toBe("apply");
  });

  it("waits until the query's own results have settled", () => {
    // Applying against a null default would lock a display chosen for the
    // previous query's data.
    expect(getRequestedDisplayAction({ ...base, defaultDisplay: null })).toBe(
      "wait",
    );
  });

  it("does nothing when the tool asked for no chart type", () => {
    expect(getRequestedDisplayAction({ ...base, requestedDisplay: null })).toBe(
      "settle",
    );
  });

  it("settles without applying when the display already matches", () => {
    expect(getRequestedDisplayAction({ ...base, currentDisplay: "bar" })).toBe(
      "settle",
    );
  });

  it("never overrides the user's own pick after the request was honored", () => {
    // The user switched to line; the request must not drag it back to bar.
    expect(
      getRequestedDisplayAction({
        ...base,
        currentDisplay: "line",
        settledQueryKey: "query-1",
      }),
    ).toBe("settle");
  });

  it("honors the request again for a new query", () => {
    expect(
      getRequestedDisplayAction({
        ...base,
        queryKey: "query-2",
        settledQueryKey: "query-1",
      }),
    ).toBe("apply");
  });
});
