import type { CardDisplayType, Dataset } from "metabase-types/api";

import {
  type DefaultDisplayState,
  captureDefaultDisplay,
} from "./captureDefaultDisplay";

const createQueryResult = () => ({}) as Dataset;

const createState = ({
  defaultDisplay,
  lastQueryResult,
  queryKey = "query-1",
}: {
  defaultDisplay: CardDisplayType | null;
  lastQueryResult: Dataset | null;
  queryKey?: string | null;
}): DefaultDisplayState => ({
  defaultDisplay,
  lastQueryResult,
  queryKey,
});

describe("captureDefaultDisplay", () => {
  it("does not capture stale SDK state after the query changes", () => {
    const previousResult = createQueryResult();

    const firstStaleState = captureDefaultDisplay({
      currentDisplay: "line",
      queryKey: "query-2",
      queryResult: previousResult,
      previousState: createState({
        defaultDisplay: "bar",
        lastQueryResult: previousResult,
      }),
    });

    expect(firstStaleState.defaultDisplay).toBeNull();
    expect(firstStaleState.queryKey).toBe("query-1");
    expect(firstStaleState.lastQueryResult).toBe(previousResult);

    const secondStaleState = captureDefaultDisplay({
      currentDisplay: "line",
      queryKey: "query-2",
      queryResult: previousResult,
      previousState: firstStaleState,
    });

    expect(secondStaleState.defaultDisplay).toBeNull();
    expect(secondStaleState.queryKey).toBe("query-1");
    expect(secondStaleState.lastQueryResult).toBe(previousResult);

    const nextResult = createQueryResult();

    const nextState = captureDefaultDisplay({
      currentDisplay: "scalar",
      queryKey: "query-2",
      queryResult: nextResult,
      previousState: secondStaleState,
    });

    expect(nextState.defaultDisplay).toBe("scalar");
    expect(nextState.queryKey).toBe("query-2");
    expect(nextState.lastQueryResult).toBe(nextResult);
  });

  it("captures the current display when the SDK state has updated", () => {
    expect(
      captureDefaultDisplay({
        currentDisplay: "line",
        queryKey: "query-1",
        queryResult: createQueryResult(),
        previousState: createState({
          defaultDisplay: null,
          lastQueryResult: null,
        }),
      }).defaultDisplay,
    ).toBe("line");
  });

  it("replaces the table placeholder with the settled default display", () => {
    expect(
      captureDefaultDisplay({
        currentDisplay: "line",
        queryKey: "query-1",
        queryResult: createQueryResult(),
        previousState: createState({
          defaultDisplay: "table",
          lastQueryResult: createQueryResult(),
        }),
      }).defaultDisplay,
    ).toBe("line");
  });
});
