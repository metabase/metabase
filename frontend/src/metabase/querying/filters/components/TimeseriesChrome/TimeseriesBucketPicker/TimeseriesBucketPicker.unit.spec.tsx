import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TemporalUnit, TestColumnSpec } from "metabase-types/api";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { TimeseriesBucketPicker } from "./TimeseriesBucketPicker";

interface QueryWithBreakoutOpts {
  query?: Lib.Query;
  stageIndex?: number;
  column?: TestColumnSpec;
  bucket?: TemporalUnit | null;
}

function createQueryWithBreakout({
  column = {
    type: "column",
    sourceName: "ORDERS",
    name: "CREATED_AT",
  },
  bucket = "month",
  stageIndex = -1,
}: QueryWithBreakoutOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        breakouts: [
          {
            ...column,
            unit: bucket ?? undefined,
          },
        ],
      },
    ],
  });

  const [breakout] = Lib.breakouts(query, stageIndex);
  return {
    query,
    breakout,
    column: checkNotNull(Lib.breakoutColumn(query, stageIndex, breakout)),
  };
}

interface SetupOpts {
  query: Lib.Query;
  stageIndex?: number;
  breakout: Lib.BreakoutClause;
  column: Lib.ColumnMetadata;
}

function setup({ query, breakout, column, stageIndex = -1 }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <TimeseriesBucketPicker
      query={query}
      stageIndex={stageIndex}
      breakout={breakout}
      column={column}
      onChange={onChange}
    />,
  );

  const getNextBucketName = () => {
    const [column] = onChange.mock.lastCall;
    const breakout = Lib.temporalBucket(column);
    return breakout ? Lib.displayInfo(query, 0, breakout).displayName : null;
  };

  return { onChange, getNextBucketName };
}

describe("TimeseriesBucketPicker", () => {
  it("should allow to add a temporal bucket", async () => {
    const { query, breakout, column } = createQueryWithBreakout({
      bucket: null,
    });
    const { getNextBucketName } = setup({ query, breakout, column });

    await userEvent.click(screen.getByText("Unbinned"));
    await userEvent.click(await screen.findByText("Month"));

    expect(getNextBucketName()).toBe("Month");
  });

  it("should allow to update a temporal bucket", async () => {
    const { query, breakout, column } = createQueryWithBreakout();
    const { getNextBucketName } = setup({ query, breakout, column });

    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(await screen.findByText("Year"));

    expect(getNextBucketName()).toBe("Year");
  });

  it("should allow to show more binning options", async () => {
    const { query, breakout, column } = createQueryWithBreakout();
    const { getNextBucketName } = setup({ query, breakout, column });

    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(screen.getByText("More…"));
    await userEvent.click(await screen.findByText("Quarter of year"));

    expect(getNextBucketName()).toBe("Quarter of year");
  });

  it("should allow to remove a temporal bucket", async () => {
    const { query, breakout, column } = createQueryWithBreakout();
    const { getNextBucketName } = setup({ query, breakout, column });

    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(screen.getByText("More…"));
    await userEvent.click(await screen.findByText("Don't bin"));

    expect(getNextBucketName()).toBeNull();
  });

  it("should show all options when the current bucket is below the More button", async () => {
    const { query, breakout, column } = createQueryWithBreakout({
      column: { type: "column", sourceName: "ORDERS", name: "CREATED_AT" },
      bucket: "quarter-of-year",
    });

    setup({ query, breakout, column });

    await userEvent.click(screen.getByText("Quarter of year"));
    expect(await screen.findByText("Month of year")).toBeInTheDocument();
  });
});
