import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findTemporalBucket,
} from "metabase-lib/test-helpers";
import { TimeseriesBucketPicker } from "./TimeseriesBucketPicker";

const STAGE_INDEX = -1;

function findBreakoutColumn(
  query: Lib.Query,
  tableName: string,
  columnName: string,
) {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return columnFinder(query, columns)(tableName, columnName);
}

interface QueryWithBreakoutOpts {
  initialQuery?: Lib.Query;
  tableName?: string;
  columnName?: string;
  bucketName?: string | null;
}

function createQueryWithBreakout({
  initialQuery = createQuery(),
  tableName = "ORDERS",
  columnName = "CREATED_AT",
  bucketName = null,
}: QueryWithBreakoutOpts = {}) {
  const column = findBreakoutColumn(initialQuery, tableName, columnName);
  const bucket = bucketName
    ? findTemporalBucket(initialQuery, column, bucketName)
    : null;
  const query = Lib.breakout(
    initialQuery,
    STAGE_INDEX,
    Lib.withTemporalBucket(column, bucket),
  );

  return { query, column: findBreakoutColumn(query, tableName, columnName) };
}

interface SetupOpts {
  query: Lib.Query;
  stageIndex?: number;
  column: Lib.ColumnMetadata;
}

function setup({ query, stageIndex = STAGE_INDEX, column }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <TimeseriesBucketPicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      onChange={onChange}
    />,
  );

  const getNextBucketName = () => {
    const [column] = onChange.mock.lastCall;
    const breakout = Lib.temporalBucket(column);
    return breakout
      ? Lib.displayInfo(query, STAGE_INDEX, breakout).displayName
      : null;
  };

  return { onChange, getNextBucketName };
}

describe("TimeseriesBucketPicker", () => {
  it("should allow to add a temporal bucket", async () => {
    const { query, column } = createQueryWithBreakout({ bucketName: null });
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Unbinned"));
    userEvent.click(await screen.findByText("Month"));

    expect(getNextBucketName()).toBe("Month");
  });

  it("should allow to update a temporal bucket", async () => {
    const { query, column } = createQueryWithBreakout({ bucketName: "Month" });
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Month"));
    userEvent.click(await screen.findByText("Year"));

    expect(getNextBucketName()).toBe("Year");
  });

  it("should allow to remove a temporal bucket", async () => {
    const { query, column } = createQueryWithBreakout({ bucketName: "Month" });
    const { getNextBucketName } = setup({ query, column });

    userEvent.click(screen.getByText("Month"));
    userEvent.click(await screen.findByText("Don't bin"));

    expect(getNextBucketName()).toBeNull();
  });
});
