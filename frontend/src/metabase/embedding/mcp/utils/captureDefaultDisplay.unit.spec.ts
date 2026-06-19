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

    expect(
      captureDefaultDisplay({
        currentDisplay: "line",
        queryKey: "query-2",
        queryResult: previousResult,
        previousState: createState({
          defaultDisplay: "bar",
          lastQueryResult: previousResult,
        }),
      }).defaultDisplay,
    ).toBeNull();
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
