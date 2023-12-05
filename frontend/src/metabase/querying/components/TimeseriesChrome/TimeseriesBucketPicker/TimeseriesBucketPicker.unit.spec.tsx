import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findTemporalBucket,
} from "metabase-lib/test-helpers";
import { TimeseriesBucketPicker } from "./TimeseriesBucketPicker";

function findBreakoutColumn(query: Lib.Query) {
  const columns = Lib.breakoutableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("ORDERS", "CREATED_AT");
}

function findMonthBucket(query: Lib.Query, column: Lib.ColumnMetadata) {
  return findTemporalBucket(query, column, "Month");
}

interface QueryWithBreakoutOpts {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  bucket?: Lib.Bucket | null;
}

function createQueryWithBreakout({
  query: initialQuery = createQuery(),
  column = findBreakoutColumn(initialQuery),
  bucket = findMonthBucket(initialQuery, column),
}: QueryWithBreakoutOpts = {}) {
  const query = Lib.breakout(
    initialQuery,
    0,
    Lib.withTemporalBucket(column, bucket),
  );

  return { query, column: findBreakoutColumn(query) };
}

interface SetupOpts {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
}

function setup({ query, column }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <TimeseriesBucketPicker
      query={query}
      stageIndex={0}
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
    const { query, column } = createQueryWithBreakout({ bucket: null });
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Unbinned"));
    userEvent.click(await screen.findByText("Month"));

    expect(getNextBucketName()).toBe("Month");
  });

  it("should allow to update a temporal bucket", async () => {
    const { query, column } = createQueryWithBreakout();
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Month"));
    userEvent.click(await screen.findByText("Year"));

    expect(getNextBucketName()).toBe("Year");
  });

  it("should allow to remove a temporal bucket", async () => {
    const { query, column } = createQueryWithBreakout();
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Month"));
    userEvent.click(await screen.findByText("Don't bin"));

    expect(getNextBucketName()).toBeNull();
  });
});
