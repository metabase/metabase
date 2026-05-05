import { fireEvent, render, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { QueryColumnInfoIcon } from "./ColumnInfoIcon";

function setup(table: string, column: string) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const columns = Lib.visibleColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const col = findColumn(table, column);

  return render(
    <QueryColumnInfoIcon query={query} stageIndex={-1} column={col} />,
  );
}

describe("QueryColumnInfoIcon", () => {
  it("should show the hovercard only on hover", async () => {
    setup("PRODUCTS", "CATEGORY");

    const icon = screen.getByLabelText("More info");

    expect(icon).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();

    fireEvent.mouseEnter(icon);

    await waitFor(
      () => {
        expect(screen.getByText("Category")).toBeInTheDocument();
      },
      {
        timeout: 1200,
      },
    );
  });
});
