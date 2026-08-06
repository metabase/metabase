import { getRequestedDisplayAction } from "./getRequestedDisplayAction";

const base = {
  requestedDisplay: "bar",
  currentDisplay: "table",
  defaultDisplay: "table",
  queryKey: "query-1",
  settledQueryKey: null,
  isDisplayLocked: false,
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

  it("applies a matching display that is not yet locked, so a later reset cannot drop it", () => {
    // The requested type can coincide with the SDK's own pick while the display
    // is still unlocked. Settling here would skip `lockDisplay()`, leaving a
    // later data-shape reset free to override what the tool asked for.
    expect(
      getRequestedDisplayAction({
        ...base,
        currentDisplay: "bar",
        isDisplayLocked: false,
      }),
    ).toBe("apply");
  });

  it("settles when the matching display is already locked", () => {
    expect(
      getRequestedDisplayAction({
        ...base,
        currentDisplay: "bar",
        isDisplayLocked: true,
      }),
    ).toBe("settle");
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
